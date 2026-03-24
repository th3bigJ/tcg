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
    const base = await payload.findByID({
      collection: "master-card-list",
      id: "4927",
      depth: 1,
      overrideAccess: true,
    });

    const setId = typeof base.set === "object" && base.set ? base.set.id : base.set;
    const setName = typeof base.set === "object" && base.set ? String(base.set.name ?? "") : "";
    const setTcgdexId =
      typeof base.set === "object" && base.set ? String(base.set.tcgdexId ?? "") : "";
    const brandId = typeof base.brand === "object" && base.brand ? base.brand.id : base.brand;

    if (!setId || !brandId || !setTcgdexId) {
      throw new Error("Card 4927 is missing set/brand metadata");
    }

    const setFromApi = await tcgdex.fetch("sets", setTcgdexId);
    const officialCount = Number(setFromApi?.cardCount?.official ?? setFromApi?.cardCount?.total ?? 0);

    const targets = [
      { mode: "update" as const, rowId: "4927", tcgdexId: "ecard2-103a" },
      { mode: "upsert" as const, tcgdexId: "ecard2-103b" },
    ];

    const results: Array<Record<string, unknown>> = [];

    for (const target of targets) {
      const card = (await tcgdex.fetch("cards", target.tcgdexId)) as TCGdexCard | undefined;
      if (!card) {
        throw new Error(`Card not found on TCGdex: ${target.tcgdexId}`);
      }

      const localIdRaw = String(card.localId ?? "").trim();
      if (!localIdRaw) {
        throw new Error(`TCGdex card missing localId: ${target.tcgdexId}`);
      }

      const cardNumber = officialCount > 0 ? `${localIdRaw}/${officialCount}` : localIdRaw;

      const data = {
        brand: brandId,
        set: setId,
        cardName: String(card.name ?? ""),
        cardNumber,
        fullDisplayName: `${String(card.name ?? "").trim()} ${cardNumber} ${setName}`.trim(),
        externalId: null,
        tcgdex_id: target.tcgdexId,
        no_pricing: !hasPricing(card),
        category: card.category ?? undefined,
        localId: localIdRaw,
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
        dexId: (card.dexId ?? []).map((value) => ({ value })),
        isActive: true,
      };

      if (target.mode === "update") {
        await payload.update({
          collection: "master-card-list",
          id: target.rowId,
          data,
          overrideAccess: true,
        });
        results.push({
          action: "updated",
          id: target.rowId,
          tcgdex_id: target.tcgdexId,
          localId: localIdRaw,
          no_pricing: data.no_pricing,
        });
        continue;
      }

      const existing = await payload.find({
        collection: "master-card-list",
        where: {
          and: [{ set: { equals: setId } }, { tcgdex_id: { equals: target.tcgdexId } }],
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
          action: "updated_existing",
          id: existingId,
          tcgdex_id: target.tcgdexId,
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
          action: "created",
          id: String(created.id),
          tcgdex_id: target.tcgdexId,
          localId: localIdRaw,
          no_pricing: data.no_pricing,
        });
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

