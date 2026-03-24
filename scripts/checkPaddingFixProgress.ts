import nextEnvImport from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

function parseKey(localId: string): KeyParts | null {
  const v = localId.trim().toLowerCase();
  const m = /^([a-z]*)(\d+)([a-z]*)$/i.exec(v);
  if (!m) return null;
  const numeric = Number.parseInt(m[2], 10);
  if (!Number.isFinite(numeric)) return null;
  return { prefix: m[1] ?? "", numeric, suffix: m[3] ?? "" };
}

function buildPaddingMap(extra: string[], missing: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const missingByKey = new Map<string, string[]>();

  for (const id of missing ?? []) {
    const k = parseKey(id);
    if (!k) continue;
    const key = `${k.prefix}:${k.numeric}:${k.suffix}`;
    const arr = missingByKey.get(key) ?? [];
    arr.push(id);
    missingByKey.set(key, arr);
  }

  for (const ex of extra ?? []) {
    const k = parseKey(ex);
    if (!k) continue;
    const key = `${k.prefix}:${k.numeric}:${k.suffix}`;
    const matches = missingByKey.get(key) ?? [];
    if (matches.length === 1) map.set(ex, matches[0]);
  }

  return map;
}

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const auditRaw = await readFile(
    path.join(process.cwd(), "docs", "tcgdex-set-mismatch-audit.json"),
    "utf8",
  );
  const audit = JSON.parse(auditRaw) as AuditFile;

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    let mappings = 0;
    let rowsRemainingAtSource = 0;

    for (const row of audit.audits ?? []) {
      if (!row.setTcgdexId) continue;
      const mapping = buildPaddingMap(row.extraInDb ?? [], row.missingInDb ?? []);
      if (mapping.size === 0) continue;

      const setResult = await payload.find({
        collection: "sets",
        where: { tcgdexId: { equals: row.setTcgdexId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { id: true },
      });
      const setDoc = setResult.docs[0];
      if (!setDoc) continue;
      const setId = String(setDoc.id);

      for (const fromLocalId of mapping.keys()) {
        mappings += 1;
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
        rowsRemainingAtSource += sourceRows.docs.length;
      }
    }

    // Progress proxy: if source IDs are gone, that mapping has likely been fixed.
    const percentComplete =
      mappings > 0
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(((mappings - rowsRemainingAtSource) / mappings) * 1000) / 10,
            ),
          )
        : 100;

    console.log(
      JSON.stringify(
        {
          ok: true,
          mappings,
          rowsRemainingAtSource,
          estimatedPercentComplete: percentComplete,
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

