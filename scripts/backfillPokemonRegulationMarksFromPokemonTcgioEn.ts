/**
 * Merge `regulationMark` from local `data/en/*.json` (Pokémon TCG API / pokemontcg.io shape)
 * into `data/pokemon/cards/{setKey}.json` where our card still has a missing mark.
 *
 * Companion files (Trainer Gallery, Shiny Vault, Galarian Gallery) use the same `id` scheme as
 * our `externalId` (e.g. `swsh9tg-TG01`, `swsh45sv-SV122`) and are merged when present:
 * `{setKey}tg.json`, `{setKey}sv.json`, `{setKey}gg.json`.
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillPokemonRegulationMarksFromPokemonTcgioEn.ts --dry-run
 *   node --import tsx/esm scripts/backfillPokemonRegulationMarksFromPokemonTcgioEn.ts --set=pgo,sv1
 */

import fs from "fs";
import path from "path";
import type { CardJsonEntry } from "../lib/staticDataTypes";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const REPO_ROOT = process.cwd();
const EN_DIR = path.join(REPO_ROOT, "data", "en");
const CARDS_DIR = path.join(pokemonLocalDataRoot, "cards");

const DRY_RUN = process.argv.includes("--dry-run");
const setArg = process.argv.find((a) => a.startsWith("--set="));
const ONLY_SETS = setArg
  ? setArg
      .slice("--set=".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

type EnCard = {
  id: string;
  regulationMark?: string;
};

function isMissingMark(card: CardJsonEntry): boolean {
  const v = card.regulationMark;
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** Base set JSON plus optional tg / sv / gg expansions (same layout as pokemontcg.io set splits). */
function enJsonPathsForSet(setKey: string): string[] {
  const names = [`${setKey}.json`];
  for (const suf of ["tg", "sv", "gg"] as const) {
    names.push(`${setKey}${suf}.json`);
  }
  return names
    .map((n) => path.join(EN_DIR, n))
    .filter((p) => fs.existsSync(p));
}

function loadRegulationMarkById(setKey: string): Map<string, string> {
  const map = new Map<string, string>();
  const paths = enJsonPathsForSet(setKey);
  for (const filePath of paths) {
    const raw = fs.readFileSync(filePath, "utf8");
    const rows = JSON.parse(raw) as EnCard[];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.id) continue;
      const m = row.regulationMark;
      if (typeof m !== "string" || m.trim() === "") continue;
      map.set(row.id, m.trim().toUpperCase());
    }
  }
  return map;
}

/** Extra lookup keys when `externalId` is null (e.g. some energy rows). */
function candidateIdsFromCard(card: CardJsonEntry): string[] {
  const setCode = card.setCode;
  const out: string[] = [];
  if (card.externalId) out.push(card.externalId);
  if (!card.localId) return out;
  const raw = card.localId.trim();
  if (!raw) return out;
  out.push(`${setCode}-${raw}`);
  if (/^\d+$/u.test(raw)) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) {
      out.push(`${setCode}-${n}`);
      out.push(`${setCode}-${String(n).padStart(3, "0")}`);
    }
  }
  return [...new Set(out)];
}

async function main() {
  let updated = 0;
  let skippedNoEn = 0;
  let skippedHasMark = 0;
  let skippedNoMatch = 0;

  const setFiles = fs
    .readdirSync(CARDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/u, ""))
    .filter((code) => !ONLY_SETS || ONLY_SETS.includes(code))
    .sort();

  for (const setKey of setFiles) {
    const enPaths = enJsonPathsForSet(setKey);
    if (enPaths.length === 0) {
      skippedNoEn++;
      continue;
    }

    const byId = loadRegulationMarkById(setKey);
    if (byId.size === 0) {
      skippedNoEn++;
      continue;
    }

    const filePath = path.join(CARDS_DIR, `${setKey}.json`);
    const cards: CardJsonEntry[] = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let setUpdated = 0;

    for (const card of cards) {
      if (!isMissingMark(card)) {
        skippedHasMark++;
        continue;
      }

      let mark: string | undefined;
      for (const id of candidateIdsFromCard(card)) {
        const hit = byId.get(id);
        if (hit) {
          mark = hit;
          break;
        }
      }

      if (!mark) {
        skippedNoMatch++;
        continue;
      }

      if (!DRY_RUN) {
        card.regulationMark = mark;
      }
      updated++;
      setUpdated++;
    }

    if (!DRY_RUN && setUpdated > 0) {
      fs.writeFileSync(filePath, `${JSON.stringify(cards, null, 2)}\n`);
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        onlySets: ONLY_SETS,
        enDir: EN_DIR,
        updated,
        skippedNoEn,
        skippedHasMark,
        skippedNoMatch,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
