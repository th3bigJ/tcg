import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

type TCGdexCard = {
  id: string;
  localId?: string;
  name?: string;
  category?: string;
  illustrator?: string;
  rarity?: string;
  stage?: string;
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  trainerType?: string;
  energyType?: string;
  regulationMark?: string;
  dexId?: number[];
  pricing?: {
    tcgplayer?: unknown;
    cardmarket?: unknown;
  };
};

function hasPricing(card: TCGdexCard): boolean {
  return card.pricing?.tcgplayer != null || card.pricing?.cardmarket != null;
}

function mapLocalIdToTcgdexToken(localId: string): string {
  const raw = localId.trim();
  if (raw === "?") return "%3F";
  if (raw.toLowerCase() === "%3f") return "%3F";
  return raw.toUpperCase();
}

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });
  const tcgdex = new TCGdex("en");

  try {
    const setRes = await payload.find({
      collection: "sets",
      where: { tcgdexId: { equals: "exu" } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { id: true, name: true, tcgdexId: true, brand: true },
    });
    const setDoc = setRes.docs[0];
    if (!setDoc) throw new Error("Set exu not found");

    const setId = String(setDoc.id);
    const setName = String(setDoc.name ?? "Unseen Forces Unown Collection");
    const brandId =
      typeof setDoc.brand === "object" && setDoc.brand && "id" in setDoc.brand
        ? setDoc.brand.id
        : setDoc.brand;
    if (!brandId) throw new Error("Set exu has no brand");

    const setFromApi = await tcgdex.fetch("sets", "exu");
    const officialCount = Number(setFromApi?.cardCount?.official ?? setFromApi?.cardCount?.total ?? 0);

    const cardsRes = await payload.find({
      collection: "master-card-list",
      where: { set: { equals: setId } },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
      select: {
        id: true,
        localId: true,
        tcgdex_id: true,
      },
    });

    let updated = 0;
    let unresolved = 0;

    for (const row of cardsRes.docs as Array<Record<string, unknown>>) {
      const id = String(row.id);
      const localId = typeof row.localId === "string" ? row.localId.trim() : "";
      if (!localId) {
        unresolved += 1;
        continue;
      }

      const token = mapLocalIdToTcgdexToken(localId);
      const tcgdexId = `exu-${token}`;
      let card: TCGdexCard | null = null;
      try {
        card = (await tcgdex.fetch("cards", tcgdexId)) as TCGdexCard | null;
      } catch {
        card = null;
      }
      if (!card) {
        unresolved += 1;
        continue;
      }

      const canonicalLocal = String(card.localId ?? token);
      const cardName = String(card.name ?? "Unown");
      const cardNumber = officialCount > 0 ? `${canonicalLocal}/${officialCount}` : canonicalLocal;

      await payload.update({
        collection: "master-card-list",
        id,
        data: {
          cardName,
          cardNumber,
          fullDisplayName: `${cardName} ${cardNumber} ${setName}`.trim(),
          localId: canonicalLocal,
          tcgdex_id: tcgdexId,
          externalId: null,
          no_pricing: !hasPricing(card),
          category: card.category ?? undefined,
          rarity: card.rarity ?? undefined,
          subtypes: card.stage ? [card.stage] : [],
          stage: card.stage ?? undefined,
          hp: card.hp ?? undefined,
          elementTypes: card.types ?? [],
          evolveFrom: card.evolveFrom ?? undefined,
          trainerType: card.trainerType ?? undefined,
          energyType: card.energyType ?? undefined,
          artist: card.illustrator ?? undefined,
          regulationMark: card.regulationMark ?? undefined,
          dexId: Array.isArray(card.dexId) ? card.dexId.map((value) => ({ value })) : [],
          isActive: true,
        },
        overrideAccess: true,
      });
      updated += 1;
    }

    // Ensure %3F row exists.
    const qMarkRes = await payload.find({
      collection: "master-card-list",
      where: {
        and: [{ set: { equals: setId } }, { tcgdex_id: { equals: "exu-%3F" } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { id: true },
    });

    let createdQuestion = false;
    if ((qMarkRes.docs?.length ?? 0) === 0) {
      const qCard = (await tcgdex.fetch("cards", "exu-%3F")) as TCGdexCard | null;
      if (qCard) {
        const canonicalLocal = String(qCard.localId ?? "%3F");
        const cardName = String(qCard.name ?? "Unown");
        const cardNumber = officialCount > 0 ? `${canonicalLocal}/${officialCount}` : canonicalLocal;
        await payload.create({
          collection: "master-card-list",
          data: {
            brand: brandId,
            set: setId,
            cardName,
            cardNumber,
            fullDisplayName: `${cardName} ${cardNumber} ${setName}`.trim(),
            localId: canonicalLocal,
            tcgdex_id: "exu-%3F",
            externalId: null,
            no_pricing: !hasPricing(qCard),
            category: qCard.category ?? undefined,
            rarity: qCard.rarity ?? undefined,
            subtypes: qCard.stage ? [qCard.stage] : [],
            stage: qCard.stage ?? undefined,
            hp: qCard.hp ?? undefined,
            elementTypes: qCard.types ?? [],
            evolveFrom: qCard.evolveFrom ?? undefined,
            trainerType: qCard.trainerType ?? undefined,
            energyType: qCard.energyType ?? undefined,
            artist: qCard.illustrator ?? undefined,
            regulationMark: qCard.regulationMark ?? undefined,
            dexId: Array.isArray(qCard.dexId) ? qCard.dexId.map((value) => ({ value })) : [],
            isActive: true,
          },
          overrideAccess: true,
        });
        createdQuestion = true;
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          setTcgdexId: "exu",
          scanned: cardsRes.docs.length,
          updated,
          unresolved,
          createdQuestion,
        },
        null,
        2,
      ),
    );
  } finally {
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

