import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

function hasPricing(card: unknown): boolean {
  if (!card || typeof card !== "object" || !("pricing" in card)) return false;
  const pricing = (card as { pricing?: unknown }).pricing;
  if (!pricing || typeof pricing !== "object") return false;
  const row = pricing as { tcgplayer?: unknown; cardmarket?: unknown };
  return row.tcgplayer != null || row.cardmarket != null;
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
      id: "6144",
      depth: 1,
      overrideAccess: true,
    });
    const setId = typeof base.set === "object" && base.set ? base.set.id : base.set;
    const setName = typeof base.set === "object" && base.set ? String(base.set.name ?? "") : "";
    const setTcgdexId =
      typeof base.set === "object" && base.set ? String(base.set.tcgdexId ?? "") : "ex13";
    const brandId = typeof base.brand === "object" && base.brand ? base.brand.id : base.brand;

    const card = await tcgdex.fetch("cards", "ex13-102");
    const set = await tcgdex.fetch("sets", setTcgdexId || "ex13");
    const officialCount = Number(set?.cardCount?.official ?? set?.cardCount?.total ?? 0);
    const localIdRaw = String(card?.localId ?? "102");
    const cardName = String(card?.name ?? "Gyarados Star δ");
    const cardNumber = officialCount > 0 ? `${localIdRaw}/${officialCount}` : localIdRaw;

    await payload.update({
      collection: "master-card-list",
      id: "6144",
      data: {
        brand: brandId,
        set: setId,
        cardName,
        cardNumber,
        fullDisplayName: `${cardName} ${cardNumber} ${setName}`.trim(),
        localId: localIdRaw,
        tcgdex_id: "ex13-102",
        externalId: null,
        no_pricing: !hasPricing(card),
        category: card?.category ?? undefined,
        rarity: card?.rarity ?? undefined,
        subtypes: card?.stage ? [card.stage] : [],
        stage: card?.stage ?? undefined,
        hp: card?.hp ?? undefined,
        elementTypes: card?.types ?? [],
        evolveFrom: card?.evolveFrom ?? undefined,
        trainerType: card?.trainerType ?? undefined,
        energyType: card?.energyType ?? undefined,
        artist: card?.illustrator ?? undefined,
        variants: card?.variants
          ? {
              firstEdition: card.variants.firstEdition ?? false,
              holo: card.variants.holo ?? false,
              normal: card.variants.normal ?? false,
              reverse: card.variants.reverse ?? false,
              wPromo: card.variants.wPromo ?? false,
            }
          : undefined,
        regulationMark: card?.regulationMark ?? undefined,
        dexId: Array.isArray(card?.dexId) ? card.dexId.map((value) => ({ value })) : [],
        isActive: true,
      },
      overrideAccess: true,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          id: "6144",
          tcgdex_id: "ex13-102",
          localId: localIdRaw,
          cardName,
          no_pricing: !hasPricing(card),
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

