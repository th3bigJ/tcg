import nextEnvImport from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";

import TCGdex from "@tcgdex/sdk";

const tcgdex = new TCGdex("en");

type SetRow = {
  setTcgdexId: string;
  setName: string;
};

function parseSetRowsFromReport(md: string): SetRow[] {
  const rows: SetRow[] = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const parts = line.split("|").map((v) => v.trim());
    // ['', series, set name, set_tcgdex_id, ...]
    if (parts.length < 5) continue;
    const series = parts[1] ?? "";
    const setName = parts[2] ?? "";
    const setTcgdexId = parts[3] ?? "";
    if (!series || series === "Series" || series.startsWith("---")) continue;
    if (!setTcgdexId || setTcgdexId === "set_tcgdex_id") continue;
    if (series === "**All**") continue;
    rows.push({ setTcgdexId, setName });
  }
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.setTcgdexId)) return false;
    seen.add(row.setTcgdexId);
    return true;
  });
}

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

  const reportPath = path.join(process.cwd(), "docs", "tcgdex-id-by-set.md");
  const reportMd = await readFile(reportPath, "utf8");
  const rows = parseSetRowsFromReport(reportMd);

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    const results: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const setRes = await payload.find({
        collection: "sets",
        where: { tcgdexId: { equals: row.setTcgdexId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { id: true, name: true },
      });
      const setDoc = setRes.docs[0];
      if (!setDoc) {
        results.push({ setTcgdexId: row.setTcgdexId, error: "set not found" });
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
        select: { id: true, localId: true, no_pricing: true },
      });

      let updated = 0;
      let updatedByUnpadded = 0;
      let unresolvedAfter = 0;

      for (const doc of unresolved.docs as Array<Record<string, unknown>>) {
        const id = String(doc.id);
        const localId = typeof doc.localId === "string" ? doc.localId.trim() : "";
        if (!localId) {
          unresolvedAfter += 1;
          continue;
        }

        const candidates = buildCandidates(row.setTcgdexId, localId);
        let winner: string | null = null;
        let noPricing = false;
        for (const candidate of candidates) {
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
          unresolvedAfter += 1;
          continue;
        }

        await payload.update({
          collection: "master-card-list",
          id,
          data: {
            tcgdex_id: winner,
            no_pricing: noPricing,
            externalId: null,
          },
          overrideAccess: true,
        });
        updated += 1;

        if (/^\d+$/.test(localId)) {
          const padded = `${row.setTcgdexId}-${String(Number.parseInt(localId, 10)).padStart(3, "0")}`;
          if (winner !== padded) {
            updatedByUnpadded += 1;
          }
        }
      }

      results.push({
        setTcgdexId: row.setTcgdexId,
        setName: String(setDoc.name ?? row.setName),
        unresolvedScanned: unresolved.docs.length,
        updated,
        updatedByUnpadded,
        unresolvedAfter,
      });
      console.log(
        `[${row.setTcgdexId}] unresolved=${unresolved.docs.length} updated=${updated} unpaddedWins=${updatedByUnpadded} unresolvedAfter=${unresolvedAfter}`,
      );
    }

    console.log(JSON.stringify({ ok: true, setCount: rows.length, results }, null, 2));
  } finally {
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

