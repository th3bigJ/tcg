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
  if (!trimmed) return [];
  const out = new Set<string>();
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

      const unresolved = await payload.find({
        collection: "master-card-list",
        where: {
          and: [{ set: { equals: String(setDoc.id) } }, { tcgdex_id: { equals: "" } }],
        },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
        select: { id: true, localId: true },
      });

      let updated = 0;
      let stillUnresolved = 0;
      let noPricingTrue = 0;

      for (const row of unresolved.docs as Array<Record<string, unknown>>) {
        const id = String(row.id);
        const localId = typeof row.localId === "string" ? row.localId.trim() : "";
        if (!localId) {
          stillUnresolved += 1;
          continue;
        }

        let winner: string | null = null;
        let noPricing = false;
        for (const candidate of buildCandidates(setTcgdexId, localId)) {
          try {
            const card = await tcgdex.fetch("cards", candidate);
            if (!card) continue;
            winner = candidate;
            noPricing = !hasPricing(card);
            break;
          } catch {
            // continue
          }
        }

        if (!winner) {
          stillUnresolved += 1;
          continue;
        }

        if (noPricing) noPricingTrue += 1;
        await payload.update({
          collection: "master-card-list",
          id,
          data: { tcgdex_id: winner, no_pricing: noPricing, externalId: null },
          overrideAccess: true,
        });
        updated += 1;
      }

      console.log(
        `[${setTcgdexId}] unresolved=${unresolved.docs.length} updated=${updated} stillUnresolved=${stillUnresolved}`,
      );
      summary.push({
        setTcgdexId,
        setName: String(setDoc.name ?? ""),
        unresolvedScanned: unresolved.docs.length,
        updated,
        stillUnresolved,
        noPricingTrueFromUpdates: noPricingTrue,
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

