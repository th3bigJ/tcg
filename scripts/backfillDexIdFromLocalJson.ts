import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";
import { Pool } from "pg";

/**
 * Backfill `master_card_list.dex_id` from `data/cards/en/{setCode}.json` → `nationalPokedexNumbers`.
 *
 * Targets rows where `dex_id` is an empty JSON array (`[]`). Resolves the set via `set_id` → `sets.code`,
 * loads the matching local JSON, matches the card by `external_id` / `local_id` / name, then writes
 * dex_id as `[{ "value": n }, ...]` (Payload shape).
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillDexIdFromLocalJson.ts           # dry-run (default)
 *   node --import tsx/esm scripts/backfillDexIdFromLocalJson.ts --apply   # write to DB
 */

type JsonCard = {
  id: string;
  name: string;
  supertype?: string;
  number?: string;
  nationalPokedexNumbers?: number[];
};

const getDatabaseUri = (): string => {
  const uri = process.env.DATABASE_URI?.trim();
  if (!uri) throw new Error("DATABASE_URI is not set (e.g. in .env.local).");
  return uri;
};

function normalizeNumToken(value: string): string {
  const t = String(value ?? "").trim();
  if (/^\d+$/.test(t)) return String(Number.parseInt(t, 10));
  return t.toLowerCase();
}

function normalizeNameKey(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Possible JSON `id` values for a DB row (handles me02.5-033 vs me2pt5-33, etc.). */
function candidateJsonIds(setCode: string, externalId: string, localId: string): string[] {
  const code = setCode.trim();
  const out = new Set<string>();
  if (externalId) {
    out.add(externalId);
    out.add(externalId.toLowerCase());
  }
  const lastDash = externalId.lastIndexOf("-");
  if (lastDash > 0) {
    const suffix = externalId.slice(lastDash + 1);
    const n = normalizeNumToken(suffix);
    out.add(`${code}-${n}`);
    out.add(`${code.toLowerCase()}-${n}`);
  }
  if (localId) {
    const n = normalizeNumToken(localId);
    out.add(`${code}-${n}`);
    out.add(`${code.toLowerCase()}-${n}`);
  }
  return [...out];
}

function findCardInSet(
  cards: JsonCard[],
  setCode: string,
  externalId: string,
  localId: string,
  cardName: string,
): JsonCard | null {
  for (const cid of candidateJsonIds(setCode, externalId, localId)) {
    const found = cards.find((c) => c.id === cid);
    if (found) return found;
  }
  const wantNum = normalizeNumToken(localId);
  const wantName = normalizeNameKey(cardName);
  const matches = cards.filter(
    (c) => normalizeNumToken(c.number ?? "") === wantNum && normalizeNameKey(c.name) === wantName,
  );
  if (matches.length === 1) return matches[0];
  return null;
}

function dexPayloadFromNational(nums: number[] | undefined): { value: number }[] | null {
  if (!Array.isArray(nums) || nums.length === 0) return null;
  const unique = [...new Set(nums.filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0))];
  if (unique.length === 0) return null;
  unique.sort((a, b) => a - b);
  return unique.map((value) => ({ value }));
}

export default async function backfillDexIdFromLocalJson() {
  const apply = process.argv.includes("--apply");
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const pool = new Pool({ connectionString: getDatabaseUri() });
  const cardsDir = path.join(process.cwd(), "data/cards/en");

  const { rows } = await pool.query<{
    id: number;
    external_id: string | null;
    local_id: string | null;
    card_name: string | null;
    code: string;
  }>(
    `
    SELECT m.id, m.external_id, m.local_id, m.card_name, s.code
    FROM master_card_list m
    JOIN sets s ON s.id = m.set_id
    WHERE m.dex_id = '[]'::jsonb
    ORDER BY m.id
    `,
  );

  const jsonCache = new Map<string, JsonCard[]>();
  let missingFile = 0;
  let parseErrors = 0;
  let matchedNoDex = 0;
  let matchedWithDex = 0;
  let missingSetCode = 0;
  let missingRowFields = 0;
  let notFoundInJson = 0;
  let updated = 0;

  const updates: { id: number; dex: { value: number }[] }[] = [];

  for (const row of rows) {
    const setCode = row.code?.trim() ?? "";
    const externalId = (row.external_id ?? "").trim();
    const localId = (row.local_id ?? "").trim();
    const cardName = (row.card_name ?? "").trim();
    if (!setCode) {
      missingSetCode++;
      continue;
    }
    if (!localId || !cardName) {
      missingRowFields++;
      continue;
    }

    let cards = jsonCache.get(setCode);
    if (cards === undefined) {
      const fp = path.join(cardsDir, `${setCode}.json`);
      try {
        const raw = await fs.readFile(fp, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
          parseErrors++;
          jsonCache.set(setCode, []);
          continue;
        }
        cards = parsed as JsonCard[];
        jsonCache.set(setCode, cards);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ENOENT") missingFile++;
        else parseErrors++;
        jsonCache.set(setCode, []);
        continue;
      }
    }

    if (cards.length === 0) continue;

    const card = findCardInSet(cards, setCode, externalId, localId, cardName);
    if (!card) {
      notFoundInJson++;
      continue;
    }

    const dex = dexPayloadFromNational(card.nationalPokedexNumbers);
    if (!dex) {
      matchedNoDex++;
      continue;
    }

    matchedWithDex++;
    updates.push({ id: row.id, dex });
  }

  if (apply && updates.length > 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const u of updates) {
        await client.query(`UPDATE master_card_list SET dex_id = $1::jsonb WHERE id = $2`, [
          JSON.stringify(u.dex),
          u.id,
        ]);
        updated++;
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  await pool.end();

  console.log(
    [
      `Rows with empty dex_id ([]):     ${rows.length}`,
      `Skipped (no sets.code / join):   ${missingSetCode}`,
      `Skipped (missing localId/name):  ${missingRowFields}`,
      `Set JSON file missing:           ${missingFile}`,
      `JSON parse / invalid:            ${parseErrors}`,
      `Card not found in local JSON:    ${notFoundInJson}`,
      `Matched JSON, no dex numbers:    ${matchedNoDex} (e.g. Trainers/Energy)`,
      `Matched JSON, has dex numbers:   ${matchedWithDex}`,
      apply ? `Updated in DB:                 ${updated}` : `Dry-run (use --apply):         ${updates.length} would update`,
    ].join("\n"),
  );
}

backfillDexIdFromLocalJson().catch((err) => {
  console.error(err);
  process.exit(1);
});
