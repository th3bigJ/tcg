import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

type SetId = "sv01" | "sv08";

const TARGET_SETS: SetId[] = ["sv01", "sv08"];
const tcgdex = new TCGdex("en");

function hasPricing(card: unknown): boolean {
  if (!card || typeof card !== "object" || !("pricing" in card)) return false;
  const pricing = (card as { pricing?: unknown }).pricing;
  if (!pricing || typeof pricing !== "object") return false;
  const row = pricing as { tcgplayer?: unknown; cardmarket?: unknown };
  return row.tcgplayer != null || row.cardmarket != null;
}

function buildCandidates(setTcgdexId: string, localId: string): string[] {
  const trimmed = localId.trim();
  const out = new Set<string>();
  if (!trimmed) return [];

  out.add(`${setTcgdexId}-${trimmed}`);

  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    if (Number.isFinite(n)) {
      out.add(`${setTcgdexId}-${n}`);
      out.add(`${setTcgdexId}-${String(n).padStart(3, "0")}`);
    }
  }

  return [...out];
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

    for (const setTcgdexId of TARGET_SETS) {
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

      const cardsRes = await payload.find({
        collection: "master-card-list",
        where: { set: { equals: String(setDoc.id) } },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
        select: { id: true, localId: true, tcgdex_id: true, no_pricing: true },
      });

      let scanned = 0;
      let filled = 0;
      let unresolved = 0;
      let noPricingTrue = 0;

      for (const row of cardsRes.docs as Array<Record<string, unknown>>) {
        scanned += 1;
        const id = String(row.id);
        const localId = typeof row.localId === "string" ? row.localId.trim() : "";
        if (!localId) continue;

        const currentTcgdex = typeof row.tcgdex_id === "string" ? row.tcgdex_id.trim() : "";
        const currentNoPricing = typeof row.no_pricing === "boolean" ? row.no_pricing : false;

        let foundId: string | null = null;
        let noPricing = false;
        for (const candidate of buildCandidates(setTcgdexId, localId)) {
          try {
            const card = await tcgdex.fetch("cards", candidate);
            if (!card) continue;
            foundId = candidate;
            noPricing = !hasPricing(card);
            break;
          } catch {
            // continue
          }
        }

        if (!foundId) {
          unresolved += 1;
          continue;
        }

        if (noPricing) noPricingTrue += 1;

        if (currentTcgdex !== foundId || currentNoPricing !== noPricing) {
          await payload.update({
            collection: "master-card-list",
            id,
            data: {
              tcgdex_id: foundId,
              no_pricing: noPricing,
              externalId: null,
            },
            overrideAccess: true,
          });
          filled += 1;
        }
      }

      summary.push({
        setTcgdexId,
        setName: String(setDoc.name ?? ""),
        scanned,
        updated: filled,
        unresolved,
        noPricingTrue,
      });
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

