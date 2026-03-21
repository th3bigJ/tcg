import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";
import { Pool } from "pg";

/**
 * Fast completeness audit: one SQL round-trip (no Payload init).
 * Compares `sets.card_count_total` to COUNT(master_card_list) per set.
 */

type AuditRow = {
  code: string;
  name: string;
  expected: number;
  imported: number;
  delta: number;
  status: "complete" | "incomplete" | "unknown_expected";
};

type DbRow = {
  code: string;
  name: string | null;
  card_count_total: string | number | null;
  imported: string;
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const makeTable = (rows: AuditRow[]): string[] => {
  const lines: string[] = [];
  lines.push("| Set Code | Set Name | card_count_total | master_card_count | Delta | Status |");
  lines.push("| --- | --- | ---: | ---: | ---: | --- |");
  for (const row of rows) {
    lines.push(
      `| ${row.code} | ${row.name} | ${row.expected} | ${row.imported} | ${row.delta} | ${row.status} |`,
    );
  }
  return lines;
};

const getDatabaseUri = (): string => {
  const uri = process.env.DATABASE_URI?.trim();
  if (!uri) {
    throw new Error("DATABASE_URI is not set. Add it to .env.local for local audits.");
  }
  return uri;
};

export default async function auditSetImportCompleteness() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const uri = getDatabaseUri();
  const pool = new Pool({ connectionString: uri, max: 1 });

  try {
    const { rows } = await pool.query<DbRow>(`
      SELECT
        s.code AS code,
        s.name AS name,
        s.card_count_total AS card_count_total,
        COUNT(m.id)::text AS imported
      FROM sets s
      LEFT JOIN master_card_list m ON m.set_id = s.id
      WHERE s.code IS NOT NULL AND btrim(s.code) <> ''
      GROUP BY s.id, s.code, s.name, s.card_count_total
      ORDER BY s.code
    `);

    const auditRows: AuditRow[] = rows.map((r) => {
      const code = String(r.code || "").trim();
      const name = String(r.name || "").trim() || "_unknown_";
      const expected = toNumber(r.card_count_total);
      const imported = toNumber(r.imported);
      const delta = imported - expected;
      const status: AuditRow["status"] =
        expected <= 0
          ? "unknown_expected"
          : imported === expected
            ? "complete"
            : "incomplete";
      return { code, name, expected, imported, delta, status };
    });

    const incomplete = auditRows.filter((row) => row.status === "incomplete");
    const unknownExpected = auditRows.filter((row) => row.status === "unknown_expected");

    const outPath = path.resolve(process.cwd(), "docs/set-import-completeness.md");
    const lines: string[] = [];
    lines.push("# Set Import Completeness Audit");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push(
      "_Built with a single SQL query (no Payload bootstrap) so this report stays fast and does not hang._",
    );
    lines.push("");
    lines.push(`Sets scanned: ${auditRows.length}`);
    lines.push(`Incomplete sets: ${incomplete.length}`);
    lines.push(`No card_count_total (0 or unset): ${unknownExpected.length}`);
    lines.push("");
    lines.push("## Incomplete Sets");
    lines.push("");
    lines.push(...makeTable(incomplete));
    lines.push("");
    lines.push("## No card_count_total (cannot compare)");
    lines.push("");
    lines.push(...makeTable(unknownExpected));
    lines.push("");

    await fs.writeFile(outPath, `${lines.join("\n")}\n`, "utf8");

    console.log(`Wrote audit report: ${outPath}`);
    console.log(`Incomplete sets: ${incomplete.length}`);
    console.log(`Sets with no card_count_total: ${unknownExpected.length}`);
  } finally {
    await pool.end();
  }
}

auditSetImportCompleteness().catch((err) => {
  console.error(err);
  process.exit(1);
});
