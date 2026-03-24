import nextEnvImport from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import TCGdex from "@tcgdex/sdk";

type SetFromReport = {
  seriesName: string;
  setName: string;
  setTcgdexId: string;
};

type SetAudit = {
  seriesName: string;
  setName: string;
  setTcgdexId: string;
  dbCount: number;
  tcgdexCount: number;
  missingInDb: string[];
  extraInDb: string[];
  duplicateInDb: string[];
  noLocalIdInDb: number;
  note?: string;
};

function parseSetsFromFilteredReport(md: string): SetFromReport[] {
  const out: SetFromReport[] = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const parts = line.split("|").map((p) => p.trim());
    // ['', Series, Set name, set_tcgdex_id, ...]
    if (parts.length < 5) continue;
    const seriesName = parts[1] ?? "";
    const setName = parts[2] ?? "";
    const setTcgdexId = parts[3] ?? "";
    if (
      !seriesName ||
      seriesName === "Series" ||
      seriesName.startsWith("---") ||
      setTcgdexId === "set_tcgdex_id"
    ) {
      continue;
    }
    // Skip the summary row
    if (seriesName === "**All**") continue;
    out.push({ seriesName, setName, setTcgdexId });
  }
  // preserve order but dedupe by tcgdex set id
  const seen = new Set<string>();
  return out.filter((row) => {
    if (seen.has(row.setTcgdexId)) return false;
    seen.add(row.setTcgdexId);
    return true;
  });
}

function normalizeLocalId(v: string): string {
  return v.trim().toLowerCase();
}

function canonicalizeLocalId(v: string): string {
  const normalized = normalizeLocalId(v);
  const match = /^([a-z]*)(\d+)([a-z]*)$/i.exec(normalized);
  if (!match) return normalized;
  const n = Number.parseInt(match[2], 10);
  if (!Number.isFinite(n)) return normalized;
  return `${match[1] ?? ""}${n}${match[3] ?? ""}`;
}

function summarize(audits: SetAudit[]) {
  let setsWithAnyMismatch = 0;
  let totalMissingInDb = 0;
  let totalExtraInDb = 0;
  let totalDuplicateInDb = 0;
  let totalNoLocalId = 0;

  for (const a of audits) {
    const hasMismatch =
      a.missingInDb.length > 0 ||
      a.extraInDb.length > 0 ||
      a.duplicateInDb.length > 0 ||
      a.noLocalIdInDb > 0;
    if (hasMismatch) setsWithAnyMismatch += 1;
    totalMissingInDb += a.missingInDb.length;
    totalExtraInDb += a.extraInDb.length;
    totalDuplicateInDb += a.duplicateInDb.length;
    totalNoLocalId += a.noLocalIdInDb;
  }

  return {
    setsAudited: audits.length,
    setsWithAnyMismatch,
    totalMissingInDb,
    totalExtraInDb,
    totalDuplicateInDb,
    totalNoLocalId,
  };
}

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const reportPath = path.join(process.cwd(), "docs", "tcgdex-id-by-set.md");
  const report = await readFile(reportPath, "utf8");
  const setsToAudit = parseSetsFromFilteredReport(report);

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });
  const tcgdex = new TCGdex("en");

  try {
    const audits: SetAudit[] = [];

    for (const set of setsToAudit) {
      const setResult = await payload.find({
        collection: "sets",
        where: { tcgdexId: { equals: set.setTcgdexId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        select: { id: true },
      });
      const setDoc = setResult.docs[0];
      if (!setDoc) {
        audits.push({
          ...set,
          dbCount: 0,
          tcgdexCount: 0,
          missingInDb: [],
          extraInDb: [],
          duplicateInDb: [],
          noLocalIdInDb: 0,
          note: "Set not found in DB by tcgdexId",
        });
        continue;
      }

      const cardsResult = await payload.find({
        collection: "master-card-list",
        where: { set: { equals: String(setDoc.id) } },
        limit: 5000,
        depth: 0,
        overrideAccess: true,
        select: { id: true, localId: true },
      });

      const dbLocalIds: string[] = [];
      let noLocalIdInDb = 0;
      for (const card of cardsResult.docs) {
        const localId =
          typeof card.localId === "string" ? normalizeLocalId(card.localId) : "";
        if (!localId) {
          noLocalIdInDb += 1;
          continue;
        }
        dbLocalIds.push(localId);
      }

      const dbSet = new Set<string>(dbLocalIds);
      const duplicates = new Set<string>();
      const seen = new Set<string>();
      for (const id of dbLocalIds) {
        if (seen.has(id)) duplicates.add(id);
        else seen.add(id);
      }
      const dbCanonicalToRaw = new Map<string, string>();
      for (const id of dbSet) {
        const key = canonicalizeLocalId(id);
        if (!dbCanonicalToRaw.has(key)) dbCanonicalToRaw.set(key, id);
      }

      let tcgdexLocalIds: string[] = [];
      let note: string | undefined;
      try {
        const tcgdexSet = await tcgdex.fetch("sets", set.setTcgdexId);
        const cards = Array.isArray(tcgdexSet?.cards) ? tcgdexSet.cards : [];
        tcgdexLocalIds = cards
          .map((c) => (typeof c?.localId === "string" ? normalizeLocalId(c.localId) : ""))
          .filter((v) => v.length > 0);
      } catch (error) {
        note = `TCGdex set fetch failed: ${error instanceof Error ? error.message : String(error)}`;
      }

      const tcgdexSetIds = new Set<string>(tcgdexLocalIds);
      const tcgdexCanonicalToRaw = new Map<string, string>();
      for (const id of tcgdexSetIds) {
        const key = canonicalizeLocalId(id);
        if (!tcgdexCanonicalToRaw.has(key)) tcgdexCanonicalToRaw.set(key, id);
      }

      const missingInDb = [...tcgdexCanonicalToRaw.entries()]
        .filter(([key]) => !dbCanonicalToRaw.has(key))
        .map(([, raw]) => raw)
        .sort();
      const extraInDb = [...dbCanonicalToRaw.entries()]
        .filter(([key]) => !tcgdexCanonicalToRaw.has(key))
        .map(([, raw]) => raw)
        .sort();

      audits.push({
        ...set,
        dbCount: dbLocalIds.length,
        tcgdexCount: tcgdexLocalIds.length,
        missingInDb,
        extraInDb,
        duplicateInDb: [...duplicates].sort(),
        noLocalIdInDb,
        note,
      });
    }

    const generatedAt = new Date().toISOString();
    const totals = summarize(audits);
    const outJsonPath = path.join(process.cwd(), "docs", "tcgdex-set-mismatch-audit.json");
    const outMdPath = path.join(process.cwd(), "docs", "tcgdex-set-mismatch-audit.md");

    await writeFile(
      outJsonPath,
      JSON.stringify({ generatedAt, totals, audits }, null, 2) + "\n",
      "utf8",
    );

    const lines: string[] = [
      "# TCGdex set card-list mismatch audit",
      "",
      `Generated at (UTC): **${generatedAt}**`,
      "",
      "Compared sets listed in `docs/tcgdex-id-by-set.md` against TCGdex set card lists (localId-level).",
      "",
      `- Sets audited: **${totals.setsAudited}**`,
      `- Sets with any mismatch: **${totals.setsWithAnyMismatch}**`,
      `- Total missing in DB (exists in TCGdex): **${totals.totalMissingInDb}**`,
      `- Total extra in DB (not in TCGdex): **${totals.totalExtraInDb}**`,
      `- Total duplicate localIds in DB: **${totals.totalDuplicateInDb}**`,
      `- Total DB cards with blank localId: **${totals.totalNoLocalId}**`,
      "",
      "| Series | Set | set_tcgdex_id | DB localIds | TCGdex localIds | Missing in DB | Extra in DB | Duplicate localIds | Blank localId rows | Notes |",
      "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ];

    for (const a of audits) {
      if (a.dbCount <= 0) {
        continue;
      }
      const esc = (s: string) => s.replaceAll("|", "\\|");
      const note = a.note ?? "";
      lines.push(
        `| ${esc(a.seriesName)} | ${esc(a.setName)} | ${esc(a.setTcgdexId)} | ${a.dbCount} | ${a.tcgdexCount} | ${a.missingInDb.length} | ${a.extraInDb.length} | ${a.duplicateInDb.length} | ${a.noLocalIdInDb} | ${esc(note)} |`,
      );
      if (a.missingInDb.length > 0) {
        lines.push(`|  | missing localIds |  |  |  |  |  |  |  | \`${a.missingInDb.join(", ")}\` |`);
      }
      if (a.extraInDb.length > 0) {
        lines.push(`|  | extra localIds |  |  |  |  |  |  |  | \`${a.extraInDb.join(", ")}\` |`);
      }
      if (a.duplicateInDb.length > 0) {
        lines.push(`|  | duplicate localIds |  |  |  |  |  |  |  | \`${a.duplicateInDb.join(", ")}\` |`);
      }
    }

    await writeFile(outMdPath, lines.join("\n") + "\n", "utf8");

    console.log(
      JSON.stringify(
        {
          ok: true,
          generatedAt,
          totals,
          files: { markdown: outMdPath, json: outJsonPath },
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

