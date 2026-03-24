import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

const SET_IDS = [
  "sm3",
  "sm7",
  "sm12",
  "sm4",
  "sm7.5",
  "sm6",
  "sm2",
  "sm8",
  "sm3.5",
  "sm1",
  "sm9",
  "sm5",
  "sm10",
  "sm11",
] as const;

type TCGdexCard = {
  id: string;
  localId?: string;
  pricing?: {
    tcgplayer?: unknown;
    cardmarket?: unknown;
  };
};

function normalizeLocalId(v: string): string {
  return v.trim().toLowerCase();
}

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
    const summary: Array<Record<string, unknown>> = [];

    for (const setTcgdexId of SET_IDS) {
      const setRes = await payload.find({
        collection: "sets",
        where: { tcgdexId: { equals: setTcgdexId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { id: true, name: true },
      });
      const setDoc = setRes.docs[0];
      if (!setDoc) {
        summary.push({ setTcgdexId, error: "set not found" });
        continue;
      }

      const tcgdexSet = await tcgdex.fetch("sets", setTcgdexId);
      const cards = Array.isArray(tcgdexSet?.cards) ? tcgdexSet.cards : [];
      const idByLocal = new Map<string, string>();
      for (const c of cards) {
        const localId = typeof c?.localId === "string" ? normalizeLocalId(c.localId) : "";
        const id = typeof c?.id === "string" ? c.id : "";
        if (!localId || !id) continue;
        if (!idByLocal.has(localId)) idByLocal.set(localId, id);
      }

      const setCards = await payload.find({
        collection: "master-card-list",
        where: { set: { equals: String(setDoc.id) } },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
        select: { id: true, localId: true, tcgdex_id: true, no_pricing: true },
      });

      let updated = 0;
      let unresolvedAfter = 0;

      for (const row of setCards.docs as Array<Record<string, unknown>>) {
        const id = String(row.id);
        const localIdRaw = typeof row.localId === "string" ? row.localId : "";
        const localKey = normalizeLocalId(localIdRaw);
        if (!localKey) {
          unresolvedAfter += 1;
          continue;
        }

        const currentTcgdex =
          typeof row.tcgdex_id === "string" ? row.tcgdex_id.trim() : "";
        const targetTcgdex = idByLocal.get(localKey) ?? "";

        if (!targetTcgdex) {
          if (!currentTcgdex) unresolvedAfter += 1;
          continue;
        }

        let targetNoPricing = false;
        try {
          const card = (await tcgdex.fetch("cards", targetTcgdex)) as TCGdexCard | null;
          targetNoPricing = !hasPricing(card as TCGdexCard);
        } catch {
          // If fetch fails, keep existing no_pricing value.
          targetNoPricing = typeof row.no_pricing === "boolean" ? row.no_pricing : false;
        }

        const currentNoPricing = typeof row.no_pricing === "boolean" ? row.no_pricing : false;
        if (currentTcgdex !== targetTcgdex || currentNoPricing !== targetNoPricing) {
          await payload.update({
            collection: "master-card-list",
            id,
            data: {
              tcgdex_id: targetTcgdex,
              externalId: null,
              no_pricing: targetNoPricing,
            },
            overrideAccess: true,
          });
          updated += 1;
        }
      }

      const postCheck = await payload.find({
        collection: "master-card-list",
        where: {
          and: [{ set: { equals: String(setDoc.id) } }, { tcgdex_id: { equals: "" } }],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { id: true },
      });
      const unresolvedEmpty = postCheck.totalDocs;
      summary.push({
        setTcgdexId,
        setName: String(setDoc.name ?? ""),
        cardsInSet: setCards.docs.length,
        mappedLocalIds: idByLocal.size,
        updated,
        unresolvedEmptyTcgdexId: unresolvedEmpty,
        unresolvedNoMap: unresolvedAfter,
      });
      console.log(
        `[${setTcgdexId}] cards=${setCards.docs.length} map=${idByLocal.size} updated=${updated} unresolvedNoMap=${unresolvedAfter}`,
      );
    }

    console.log(JSON.stringify({ ok: true, summary }, null, 2));
  } finally {
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

