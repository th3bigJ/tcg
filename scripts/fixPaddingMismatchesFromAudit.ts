import nextEnvImport from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";

import TCGdex from "@tcgdex/sdk";

type AuditRow = {
  setTcgdexId: string;
  missingInDb: string[];
  extraInDb: string[];
};

type AuditFile = {
  audits: AuditRow[];
};

type KeyParts = {
  prefix: string;
  numeric: number;
  suffix: string;
};

const tcgdex = new TCGdex("en");

function hasPricing(card: unknown): boolean {
  if (!card || typeof card !== "object" || !("pricing" in card)) return false;
  const pricing = (card as { pricing?: unknown }).pricing;
  if (!pricing || typeof pricing !== "object") return false;
  const row = pricing as { tcgplayer?: unknown; cardmarket?: unknown };
  return row.tcgplayer != null || row.cardmarket != null;
}

function parseKey(localId: string): KeyParts | null {
  const v = localId.trim().toLowerCase();
  if (!v) return null;
  const m = /^([a-z]*)(\d+)([a-z]*)$/i.exec(v);
  if (!m) return null;
  const numeric = Number.parseInt(m[2], 10);
  if (!Number.isFinite(numeric)) return null;
  return {
    prefix: m[1] ?? "",
    numeric,
    suffix: m[3] ?? "",
  };
}

function buildPaddingMap(extra: string[], missing: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const missingByKey = new Map<string, string[]>();

  for (const id of missing) {
    const k = parseKey(id);
    if (!k) continue;
    const key = `${k.prefix}:${k.numeric}:${k.suffix}`;
    const arr = missingByKey.get(key) ?? [];
    arr.push(id);
    missingByKey.set(key, arr);
  }

  for (const ex of extra) {
    const k = parseKey(ex);
    if (!k) continue;
    const key = `${k.prefix}:${k.numeric}:${k.suffix}`;
    const matches = missingByKey.get(key) ?? [];
    if (matches.length === 1) {
      map.set(ex, matches[0]);
    }
  }

  return map;
}

async function resolveTcgdexLookup(setTcgdexId: string, localId: string): Promise<{
  tcgdexId: string;
  noPricing: boolean;
} | null> {
  const direct = `${setTcgdexId}-${localId}`;
  const candidates = new Set<string>([direct]);

  if (/^\d+$/.test(localId)) {
    const n = Number.parseInt(localId, 10);
    if (Number.isFinite(n)) {
      candidates.add(`${setTcgdexId}-${n}`);
      candidates.add(`${setTcgdexId}-${String(n).padStart(3, "0")}`);
    }
  }

  for (const id of candidates) {
    try {
      const card = await tcgdex.fetch("cards", id);
      if (!card) continue;
      return {
        tcgdexId: id,
        noPricing: !hasPricing(card),
      };
    } catch {
      // try next candidate
    }
  }

  return null;
}

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const auditPath = path.join(process.cwd(), "docs", "tcgdex-set-mismatch-audit.json");
  const auditRaw = await readFile(auditPath, "utf8");
  const audit = JSON.parse(auditRaw) as AuditFile;

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  try {
    heartbeat = setInterval(() => {
      console.log(`[repair] heartbeat ${new Date().toISOString()}`);
    }, 10000);

    console.log("[repair] Connected. Starting pre-scan...");
    let totalSetsWithMappings = 0;
    let totalMappingPairs = 0;
    let totalSourceRows = 0;
    const totalAuditRows = audit.audits?.length ?? 0;
    let auditedRowsSeen = 0;

    // Pre-scan for progress denominator.
    for (const row of audit.audits ?? []) {
      auditedRowsSeen += 1;
      if (auditedRowsSeen % 20 === 0 || auditedRowsSeen === totalAuditRows) {
        console.log(
          `[repair] Pre-scan progress: rows=${auditedRowsSeen}/${totalAuditRows}, setsWithMappings=${totalSetsWithMappings}, mappings=${totalMappingPairs}, sourceRows=${totalSourceRows}`,
        );
      }
      if (!row.setTcgdexId) continue;
      const mapping = buildPaddingMap(row.extraInDb ?? [], row.missingInDb ?? []);
      if (mapping.size === 0) continue;
      totalSetsWithMappings += 1;
      totalMappingPairs += mapping.size;

      const setDoc = await payload.find({
        collection: "sets",
        where: { tcgdexId: { equals: row.setTcgdexId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { id: true },
      });
      const set = setDoc.docs[0];
      if (!set) continue;
      const setId = String(set.id);

      for (const fromLocalId of mapping.keys()) {
        const sourceRows = await payload.find({
          collection: "master-card-list",
          where: {
            and: [{ set: { equals: setId } }, { localId: { equals: fromLocalId } }],
          },
          limit: 5000,
          depth: 0,
          overrideAccess: true,
          select: { id: true },
        });
        totalSourceRows += sourceRows.docs.length;
        if (totalSourceRows > 0 && totalSourceRows % 100 === 0) {
          console.log(
            `[repair] Pre-scan row count checkpoint: sourceRows=${totalSourceRows}`,
          );
        }
      }
    }

    console.log(
      `[repair] Planned scope: sets=${totalSetsWithMappings}, mappings=${totalMappingPairs}, sourceRows=${totalSourceRows}`,
    );

    let setCount = 0;
    let fixedLocalIdRows = 0;
    let updatedCards = 0;
    let unresolvedCards = 0;
    let scannedMappings = 0;

    for (const row of audit.audits ?? []) {
      if (!row.setTcgdexId) continue;
      const mapping = buildPaddingMap(row.extraInDb ?? [], row.missingInDb ?? []);
      if (mapping.size === 0) continue;
      setCount += 1;

      const setDoc = await payload.find({
        collection: "sets",
        where: { tcgdexId: { equals: row.setTcgdexId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { id: true, name: true },
      });
      const set = setDoc.docs[0];
      if (!set) continue;
      const setId = String(set.id);
      const setName = String(set.name ?? row.setTcgdexId);
      console.log(
        `[repair] Set ${row.setTcgdexId} (${setName}) started: mappings=${mapping.size}`,
      );

      for (const [fromLocalId, toLocalId] of mapping.entries()) {
        scannedMappings += 1;
        const docs = await payload.find({
          collection: "master-card-list",
          where: {
            and: [
              { set: { equals: setId } },
              { localId: { equals: fromLocalId } },
            ],
          },
          limit: 500,
          depth: 0,
          overrideAccess: true,
          select: { id: true, localId: true, tcgdex_id: true, no_pricing: true },
        });
        if (docs.docs.length === 0) continue;

        const targetExists = await payload.find({
          collection: "master-card-list",
          where: {
            and: [
              { set: { equals: setId } },
              { localId: { equals: toLocalId } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          select: { id: true },
        });
        if ((targetExists.docs?.length ?? 0) > 0) {
          // Avoid creating duplicate localId rows in the set.
          continue;
        }

        for (const card of docs.docs as Array<Record<string, unknown>>) {
          const id = String(card.id);
          const resolved = await resolveTcgdexLookup(row.setTcgdexId, toLocalId);

          await payload.update({
            collection: "master-card-list",
            id,
            data: {
              localId: toLocalId,
              externalId: null,
              ...(resolved
                ? {
                    tcgdex_id: resolved.tcgdexId,
                    no_pricing: resolved.noPricing,
                  }
                : {}),
            },
            overrideAccess: true,
          });

          fixedLocalIdRows += 1;
          if (resolved) {
            updatedCards += 1;
          } else {
            unresolvedCards += 1;
          }

          if (fixedLocalIdRows % 25 === 0) {
            const pct =
              totalSourceRows > 0
                ? Math.round((fixedLocalIdRows / totalSourceRows) * 1000) / 10
                : 100;
            console.log(
              `[repair] Progress: fixedRows=${fixedLocalIdRows}/${totalSourceRows} (${pct}%), updatedCards=${updatedCards}, unresolvedCards=${unresolvedCards}, mappingsScanned=${scannedMappings}/${totalMappingPairs}`,
            );
          }
        }
      }

      console.log(
        `[repair] Set ${row.setTcgdexId} done: fixedRows=${fixedLocalIdRows}, updatedCards=${updatedCards}, unresolvedCards=${unresolvedCards}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          setsWithPaddingFixes: setCount,
          fixedLocalIdRows,
          updatedCards,
          unresolvedCards,
        },
        null,
        2,
      ),
    );
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

