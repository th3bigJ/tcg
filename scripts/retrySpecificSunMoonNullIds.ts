import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

const SET_IDS = ["sm3", "sm7", "sm4", "sm6", "sm2", "sm8", "sm1", "sm5"] as const;
const tcgdex = new TCGdex("en");

function normalizeLocalId(v: string): string {
  return v.trim().toLowerCase();
}

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

      const setFromApi = await tcgdex.fetch("sets", setTcgdexId);
      const cards = Array.isArray(setFromApi?.cards) ? setFromApi.cards : [];
      const idByLocal = new Map<string, string>();
      for (const c of cards) {
        const localId = typeof c?.localId === "string" ? normalizeLocalId(c.localId) : "";
        const id = typeof c?.id === "string" ? c.id : "";
        if (!localId || !id) continue;
        if (!idByLocal.has(localId)) idByLocal.set(localId, id);
      }

      const unresolvedRes = await payload.find({
        collection: "master-card-list",
        where: {
          and: [
            { set: { equals: String(setDoc.id) } },
            {
              or: [{ tcgdex_id: { exists: false } }, { tcgdex_id: { equals: null } }],
            },
          ],
        },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
        select: { id: true, localId: true },
      });

      let updated = 0;
      let stillNull = 0;
      for (const row of unresolvedRes.docs as Array<Record<string, unknown>>) {
        const id = String(row.id);
        const localId = typeof row.localId === "string" ? normalizeLocalId(row.localId) : "";
        const tcgdexId = idByLocal.get(localId) ?? "";
        if (!tcgdexId) {
          stillNull += 1;
          continue;
        }
        let noPricing = false;
        try {
          const card = await tcgdex.fetch("cards", tcgdexId);
          noPricing = !hasPricing(card);
        } catch {
          // keep default false if fetch fails unexpectedly
        }
        await payload.update({
          collection: "master-card-list",
          id,
          data: { tcgdex_id: tcgdexId, externalId: null, no_pricing: noPricing },
          overrideAccess: true,
        });
        updated += 1;
      }

      summary.push({
        setTcgdexId,
        setName: String(setDoc.name ?? ""),
        unresolvedNullScanned: unresolvedRes.docs.length,
        updated,
        stillNull,
      });
      console.log(
        `[${setTcgdexId}] unresolvedNull=${unresolvedRes.docs.length} updated=${updated} stillNull=${stillNull}`,
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

