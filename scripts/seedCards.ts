import TCGdex from "@tcgdex/sdk";
import nextEnvImport from "@next/env";

type Payload = Awaited<ReturnType<typeof import("payload").getPayload>>;

type SetWithCards = {
  id: string;
  name?: string;
  cardCount?: { total?: number; official?: number };
  cards: Array<{ id: string; localId: string; name?: string }>;
};

type FullCard = {
  id: string;
  localId: string | number;
  name: string;
  category?: string;
  illustrator?: string;
  rarity?: string;
  set?: { id?: string; name?: string; cardCount?: { total?: number; official?: number } };
  variants?: { normal?: boolean; reverse?: boolean; holo?: boolean; firstEdition?: boolean; wPromo?: boolean };
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  description?: string;
  stage?: string;
  item?: { name?: string; effect?: string };
  dexId?: number[];
  attacks?: Array<{ cost?: string[]; name: string; effect?: string; damage?: string | number }>;
  weaknesses?: Array<{ type: string; value?: string }>;
  resistances?: Array<{ type: string; value?: string }>;
  retreat?: number;
  effect?: string;
  trainerType?: string;
  energyType?: string;
  regulationMark?: string;
  legal?: { standard?: boolean; expanded?: boolean };
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

export default async function seedCards() {
  const { loadEnvConfig } = nextEnvImport as { loadEnvConfig: (dir: string, dev: boolean) => unknown };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const setCode = getArg("set") ?? "base1";
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const dryRun = process.argv.includes("--dry-run");

  const tcgdex = new TCGdex("en");

  let payload: Payload | null = null;
  let setDoc: { id: string | number } | null = null;
  let brandId: string | number | undefined;

  if (!dryRun) {
    const payloadConfig = (await import("../payload.config")).default;
    const { getPayload } = await import("payload");
    payload = await getPayload({ config: payloadConfig });

    const setResult = await payload.find({
      collection: "sets",
      where: { code: { equals: setCode } },
      limit: 1,
      depth: 1,
    });
    setDoc = setResult.docs[0] ?? null;
    if (!setDoc) {
      console.warn(`No Set found in Payload with code=${setCode}. Aborting seed.`);
      return;
    }
    const brandFromSet = (setDoc as { brand?: { id?: string | number } }).brand;
    brandId = brandFromSet?.id;
    if (!brandId) {
      const brandResult = await payload.find({ collection: "brands", limit: 1 });
      brandId = brandResult.docs[0]?.id;
    }
    if (!brandId) {
      console.warn(`No Brand found. Aborting seed for set=${setCode}.`);
      return;
    }
  }

  const fullSet = (await tcgdex.fetch("sets", setCode)) as SetWithCards | undefined;
  if (!fullSet?.cards?.length) {
    console.warn(`No set or no cards returned for setCode=${setCode}.`);
    return;
  }

  const totalCards = fullSet.cards.length;
  const toProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? Math.min(totalCards, limit)
      : dryRun
        ? 1
        : totalCards;

  if (!dryRun) {
    await payload!.update({
      collection: "sets",
      id: setDoc!.id,
      data: {
        cardCountTotal: fullSet.cardCount?.total,
        cardCountOfficial: fullSet.cardCount?.official,
      },
      overrideAccess: true,
    });
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < toProcess; i++) {
    const cardResume = fullSet.cards[i];
    const cardId = cardResume.id;

    const fullCard = (await tcgdex.fetch("cards", cardId)) as FullCard | undefined;
    if (!fullCard) {
      console.warn(`No card returned for id=${cardId}. Skipping.`);
      skippedCount++;
      continue;
    }

    const externalId = String(fullCard.id);
    const cardName = fullCard.name;
    const localId = String(fullCard.localId);
    const paddedLocalId = localId.padStart(3, "0");
    const cardCountOfficial = fullSet.cardCount?.official ?? fullCard.set?.cardCount?.official;
    const cardCountTotal = fullSet.cardCount?.total ?? fullCard.set?.cardCount?.total;
    const displayCount = typeof cardCountOfficial === "number" ? cardCountOfficial : cardCountTotal;
    const cardNumber = typeof displayCount === "number" ? `${paddedLocalId}/${displayCount}` : paddedLocalId;
    const setName = fullCard.set?.name ?? fullSet.name ?? "";
    const fullDisplayName = `${cardName} ${cardNumber} ${setName}`.trim();

    console.log(`Seeding card ${i + 1} of ${toProcess}: ${fullDisplayName}`);

    if (!dryRun) {
      const existing = await payload!.find({
        collection: "master-card-list",
        where: { externalId: { equals: externalId } },
        limit: 1,
        select: { id: true },
        overrideAccess: true,
      });
      if (existing.totalDocs > 0) {
        skippedCount++;
        continue;
      }
    }

    const variants = fullCard.variants
      ? {
          firstEdition: fullCard.variants.firstEdition ?? false,
          holo: fullCard.variants.holo ?? false,
          normal: fullCard.variants.normal ?? false,
          reverse: fullCard.variants.reverse ?? false,
          wPromo: (fullCard.variants as { wPromo?: boolean }).wPromo ?? false,
        }
      : undefined;

    const dexId =
      fullCard.dexId?.length
        ? fullCard.dexId.map((v) => ({ value: v }))
        : undefined;

    const data = {
      brand: brandId,
      set: setDoc!.id,
      cardName,
      cardNumber,
      fullDisplayName,
      category: fullCard.category ?? undefined,
      localId,
      rarity: fullCard.rarity ?? undefined,
      subtypes: fullCard.stage ? [fullCard.stage] : [],
      stage: fullCard.stage ?? undefined,
      hp: fullCard.hp ?? undefined,
      elementTypes: fullCard.types ?? [],
      evolveFrom: fullCard.evolveFrom ?? undefined,
      trainerType: fullCard.trainerType ?? undefined,
      energyType: fullCard.energyType ?? undefined,
      artist: fullCard.illustrator ?? undefined,
      externalId,
      variants,
      regulationMark: fullCard.regulationMark ?? undefined,
      dexId,
      isActive: true,
    };

    if (dryRun) {
      console.log("Dry run: would create MasterCardList with:", JSON.stringify(data, null, 2).slice(0, 800) + "...");
      continue;
    }

    await payload!.create({
      collection: "master-card-list",
      data,
      overrideAccess: true,
    });

    createdCount++;
  }

  console.log("");
  console.log(`Seed complete for setCode=${setCode}`);
  console.log(`Cards created: ${createdCount}`);
  console.log(`Cards skipped: ${skippedCount}`);

  if (payload) await payload.destroy();
  process.exit(0);
}

seedCards().catch((err) => {
  console.error(err);
  process.exit(1);
});
