import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

type TCGdexCard = {
  id: string;
  localId?: string | number;
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

const SPLITS = [
  { baseRowId: "4505", baseLocal: "50", cardNameHint: "Golduck" },
  { baseRowId: "4698", baseLocal: "74", cardNameHint: "Drowzee" },
  { baseRowId: "4861", baseLocal: "95", cardNameHint: "Mr. Mime" },
] as const;

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
    const results: Array<Record<string, unknown>> = [];

    for (const split of SPLITS) {
      const base = await payload.findByID({
        collection: "master-card-list",
        id: split.baseRowId,
        depth: 1,
        overrideAccess: true,
      });

      const setId = typeof base.set === "object" && base.set ? base.set.id : base.set;
      const setName = typeof base.set === "object" && base.set ? String(base.set.name ?? "") : "";
      const setTcgdexId =
        typeof base.set === "object" && base.set ? String(base.set.tcgdexId ?? "") : "";
      const brandId = typeof base.brand === "object" && base.brand ? base.brand.id : base.brand;

      if (!setId || !brandId || !setTcgdexId) {
        throw new Error(`Card ${split.baseRowId} is missing set/brand metadata`);
      }

      const setFromApi = await tcgdex.fetch("sets", setTcgdexId);
      const officialCount = Number(setFromApi?.cardCount?.official ?? setFromApi?.cardCount?.total ?? 0);
      const ids = [`${setTcgdexId}-${split.baseLocal}a`, `${setTcgdexId}-${split.baseLocal}b`];

      for (let idx = 0; idx < ids.length; idx += 1) {
        const tcgdexId = ids[idx];
        const full = (await tcgdex.fetch("cards", tcgdexId)) as TCGdexCard | undefined;
        if (!full) {
          throw new Error(`Card not found on TCGdex: ${tcgdexId}`);
        }

        const localIdRaw = String(full.localId ?? "").trim();
        if (!localIdRaw) {
          throw new Error(`TCGdex card missing localId: ${tcgdexId}`);
        }

        const cardNumber = officialCount > 0 ? `${localIdRaw}/${officialCount}` : localIdRaw;
        const data = {
          brand: brandId,
          set: setId,
          cardName: String(full.name ?? split.cardNameHint),
          cardNumber,
          fullDisplayName: `${String(full.name ?? split.cardNameHint).trim()} ${cardNumber} ${setName}`.trim(),
          externalId: null,
          tcgdex_id: tcgdexId,
          no_pricing: !hasPricing(full),
          category: full.category ?? undefined,
          localId: localIdRaw,
          rarity: full.rarity ?? undefined,
          subtypes: full.stage ? [full.stage] : [],
          stage: full.stage ?? undefined,
          hp: full.hp ?? undefined,
          elementTypes: full.types ?? [],
          evolveFrom: full.evolveFrom ?? undefined,
          trainerType: full.trainerType ?? undefined,
          energyType: full.energyType ?? undefined,
          artist: full.illustrator ?? undefined,
          regulationMark: full.regulationMark ?? undefined,
          dexId: (full.dexId ?? []).map((value) => ({ value })),
          isActive: true,
        };

        if (idx === 0) {
          await payload.update({
            collection: "master-card-list",
            id: split.baseRowId,
            data,
            overrideAccess: true,
          });
          results.push({
            action: "updated_base_to_a",
            id: split.baseRowId,
            tcgdex_id: tcgdexId,
            localId: localIdRaw,
            no_pricing: data.no_pricing,
          });
          continue;
        }

        const existing = await payload.find({
          collection: "master-card-list",
          where: {
            and: [{ set: { equals: setId } }, { tcgdex_id: { equals: tcgdexId } }],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          select: { id: true },
        });

        if ((existing.docs?.length ?? 0) > 0) {
          const existingId = String(existing.docs[0].id);
          await payload.update({
            collection: "master-card-list",
            id: existingId,
            data,
            overrideAccess: true,
          });
          results.push({
            action: "updated_existing_b",
            id: existingId,
            tcgdex_id: tcgdexId,
            localId: localIdRaw,
            no_pricing: data.no_pricing,
          });
        } else {
          const created = await payload.create({
            collection: "master-card-list",
            data,
            overrideAccess: true,
          });
          results.push({
            action: "created_b",
            id: String(created.id),
            tcgdex_id: tcgdexId,
            localId: localIdRaw,
            no_pricing: data.no_pricing,
          });
        }
      }
    }

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

