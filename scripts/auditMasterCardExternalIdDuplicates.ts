import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";
import { Pool } from "pg";

/**
 * Finds rows in `master_card_list` that share the same `external_id` within a set.
 * Default scope: set codes that appear incomplete in set-import-completeness reviews.
 * Override with: --sets=base1,sm1,...
 */

const DEFAULT_SET_CODES = [
  "base1",
  "cel25",
  "ecard2",
  "ex10",
  "sm1",
  "sm10",
  "sm11",
  "sm12",
  "sm2",
  "sm3",
  "sm35",
  "sm4",
  "sm5",
  "sm6",
  "sm7",
  "sm75",
  "sm8",
  "sm9",
  "smp",
  "svp",
  "swsh10",
  "swsh11",
  "swsh12",
  "swsh12pt5",
  "swsh45",
  "swsh9",
  "swshp",
] as const;

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const getDatabaseUri = (): string => {
  const uri = process.env.DATABASE_URI?.trim();
  if (!uri) {
    throw new Error("DATABASE_URI is not set. Add it to .env.local for local audits.");
  }
  return uri;
};

type DupRow = {
  set_code: string;
  external_id: string;
  row_count: string;
  master_ids: string;
  local_ids: string | null;
  card_names: string | null;
};

type BlankDupRow = {
  set_code: string;
  row_count: string;
  master_ids: string;
  local_ids: string | null;
  card_names: string | null;
};

const esc = (value: string | null | undefined): string =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");

export default async function auditMasterCardExternalIdDuplicates() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const setsArg = getArg("sets");
  const setCodes = setsArg
    ? setsArg
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : [...DEFAULT_SET_CODES];

  const pool = new Pool({ connectionString: getDatabaseUri(), max: 1 });

  try {
    const { rows: dupes } = await pool.query<DupRow>(
      `
      SELECT
        s.code AS set_code,
        m.external_id AS external_id,
        COUNT(*)::text AS row_count,
        string_agg(m.id::text, ', ' ORDER BY m.id) AS master_ids,
        string_agg(m.local_id, ' | ' ORDER BY m.id) AS local_ids,
        string_agg(m.card_name, ' | ' ORDER BY m.id) AS card_names
      FROM master_card_list m
      INNER JOIN sets s ON s.id = m.set_id
      WHERE s.code = ANY($1::text[])
        AND m.external_id IS NOT NULL
        AND btrim(m.external_id) <> ''
      GROUP BY s.code, m.external_id
      HAVING COUNT(*) > 1
      ORDER BY s.code, COUNT(*) DESC, m.external_id
      `,
      [setCodes],
    );

    const { rows: blankDupes } = await pool.query<BlankDupRow>(
      `
      SELECT
        s.code AS set_code,
        COUNT(*)::text AS row_count,
        string_agg(m.id::text, ', ' ORDER BY m.id) AS master_ids,
        string_agg(m.local_id, ' | ' ORDER BY m.id) AS local_ids,
        string_agg(m.card_name, ' | ' ORDER BY m.id) AS card_names
      FROM master_card_list m
      INNER JOIN sets s ON s.id = m.set_id
      WHERE s.code = ANY($1::text[])
        AND (m.external_id IS NULL OR btrim(m.external_id) = '')
      GROUP BY s.code
      HAVING COUNT(*) > 1
      ORDER BY s.code, COUNT(*) DESC
      `,
      [setCodes],
    );

    const outPath = path.resolve(process.cwd(), "docs/master-card-list-external-id-duplicates.md");
    const lines: string[] = [];
    lines.push("# Master Card List — duplicate `external_id` per set");
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push(
      `Scoped to **${setCodes.length}** set code(s): \`${setCodes.join(", ")}\`.`,
    );
    lines.push("");
    lines.push(
      "Rows below share the same **non-empty** `external_id` within one set — usually a bad import/merge (same API id twice).",
    );
    lines.push("");
    lines.push(`## Duplicate non-empty \`external_id\` (${dupes.length} groups)`);
    lines.push("");
    if (dupes.length === 0) {
      lines.push("_None found in this scope._");
      lines.push("");
    } else {
      lines.push("| Set Code | external_id | Rows | master_card_list ids | local_id(s) | card name(s) |");
      lines.push("| --- | --- | ---: | --- | --- | --- |");
      for (const r of dupes) {
        lines.push(
          `| ${esc(r.set_code)} | \`${esc(r.external_id)}\` | ${esc(r.row_count)} | ${esc(r.master_ids)} | ${esc(r.local_ids)} | ${esc(r.card_names)} |`,
        );
      }
      lines.push("");
    }

    lines.push(`## Sets with multiple blank \`external_id\` rows (${blankDupes.length} sets)`);
    lines.push("");
    lines.push(
      "_These are not same-id duplicates, but many cards with no `external_id` in one set — worth cleaning if you rely on that field._",
    );
    lines.push("");
    if (blankDupes.length === 0) {
      lines.push("_None (or at most one blank-id row per set in this scope)._");
      lines.push("");
    } else {
      lines.push("| Set Code | Blank external_id rows | master_card_list ids | local_id(s) | card name(s) |");
      lines.push("| --- | ---: | --- | --- | --- |");
      for (const r of blankDupes) {
        lines.push(
          `| ${esc(r.set_code)} | ${esc(r.row_count)} | ${esc(r.master_ids)} | ${esc(r.local_ids)} | ${esc(r.card_names)} |`,
        );
      }
      lines.push("");
    }

    await fs.writeFile(outPath, `${lines.join("\n")}\n`, "utf8");
    console.log(`Wrote: ${outPath}`);
    console.log(`Duplicate external_id groups: ${dupes.length}`);
    console.log(`Sets with 2+ blank external_id: ${blankDupes.length}`);
  } finally {
    await pool.end();
  }
}

auditMasterCardExternalIdDuplicates().catch((err) => {
  console.error(err);
  process.exit(1);
});
