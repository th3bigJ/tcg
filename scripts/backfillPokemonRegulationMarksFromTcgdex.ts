/**
 * Fill `regulationMark` on local Pokémon card JSON from TCGdex (`api.tcgdex.net`).
 *
 * NOTE: www.tcgcollector.com is Cloudflare-protected; simple HTTP clients cannot fetch HTML or
 * `/api/*` without a browser session or official API credentials. TCGdex exposes the same
 * regulation-letter field without that barrier and is used here.
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillPokemonRegulationMarksFromTcgdex.ts --dry-run
 *   node --import tsx/esm scripts/backfillPokemonRegulationMarksFromTcgdex.ts --set=sv1,sv2
 */

import fs from "fs";
import path from "path";
import type { CardJsonEntry } from "../lib/staticDataTypes";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const DRY_RUN = process.argv.includes("--dry-run");
const setArg = process.argv.find((a) => a.startsWith("--set="));
const ONLY_SETS = setArg
  ? setArg
      .slice("--set=".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

const CARDS_DIR = path.join(pokemonLocalDataRoot, "cards");
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en/cards";

/** Catalog `setKey` → TCGdex expansion id used in `/en/cards/{expansion}-{localId}`. */
const SET_CODE_TO_TCGDEX: Record<string, string> = {
  sv1: "sv01",
  sv2: "sv02",
  sv3: "sv03",
  sv4: "sv04",
  sv5: "sv05",
  sv6: "sv06",
  sv7: "sv07",
  sv8: "sv08",
  sv9: "sv09",
  sv10: "sv10",
  sv3pt5: "sv03.5",
  sv4pt5: "sv04.5",
  sv6pt5: "sv06.5",
  sv8pt5: "sv08.5",
  rsv10pt5: "sv10.5w",
  zsv10pt5: "sv10.5b",
  me1: "me01",
  me2: "me02",
  me3: "me03",
  mep: "mep",
  pgo: "swsh10.5",
  swsh35: "swsh3.5",
  swsh45: "swsh4.5",
  swsh12pt5: "swsh12.5",
  mcd21: "2021swsh",
  mcd22: "2022swsh",
  mcd23: "2023sv",
  mcd24: "2024sv",
  sve: "sve",
  mee: "mee",
  swsh6: "swsh6",
  swsh7: "swsh7",
  swsh8: "swsh8",
  swsh9: "swsh9",
  swsh10: "swsh10",
  swsh11: "swsh11",
  swsh12: "swsh12",
};

const UA = "Mozilla/5.0 (compatible; tcg-regulation-backfill/1.0; +https://github.com/)";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isMissingMark(card: CardJsonEntry): boolean {
  const v = card.regulationMark;
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/** SV / ME-era expansions on TCGdex use 3-digit local ids (001); SWSH-era uses unpadded numbers. */
function shouldPadThreeDigits(expId: string): boolean {
  if (expId === "sve" || expId === "mee") return true;
  if (expId.startsWith("sv")) return true;
  if (/^me\d/u.test(expId)) return true;
  return false;
}

function normalizeSuffix(tcgdexExpansionId: string, rawSuffix: string): string {
  if (!/^\d+$/u.test(rawSuffix)) {
    return rawSuffix;
  }
  const n = parseInt(rawSuffix, 10);
  if (!Number.isFinite(n)) return rawSuffix;
  if (shouldPadThreeDigits(tcgdexExpansionId)) {
    return String(n).padStart(3, "0");
  }
  return String(n);
}

/**
 * Map Scrydex-style `externalId` prefix to the TCGdex expansion id.
 * Handles main set, Trainer Gallery (`tg`), Shiny Vault (`sv`), Galarian Gallery (`gg`).
 */
function resolveTcgdexExpansionId(card: CardJsonEntry, externalPrefix: string): string | null {
  const setCode = card.setCode;
  const base = SET_CODE_TO_TCGDEX[setCode];
  if (!base) return null;

  if (externalPrefix === setCode) return base;

  if (externalPrefix.startsWith(setCode)) {
    const tail = externalPrefix.slice(setCode.length);
    if (tail === "" || tail === "tg" || tail === "sv" || tail === "gg") {
      return base;
    }
  }

  return null;
}

function buildTcgdexCardId(card: CardJsonEntry): string | null {
  const ext = card.externalId;
  if (!ext || !ext.includes("-")) return null;

  const dash = ext.indexOf("-");
  const externalPrefix = ext.slice(0, dash);
  const suffix = ext.slice(dash + 1);
  if (!suffix) return null;

  const tcgdxExp = resolveTcgdexExpansionId(card, externalPrefix);
  if (!tcgdxExp) return null;

  return `${tcgdxExp}-${normalizeSuffix(tcgdxExp, suffix)}`;
}

/** When `externalId` is null, derive TCGdex id from `localId` (e.g. SVE energy). */
function buildTcgdexCardIdFromLocalId(card: CardJsonEntry): string | null {
  const base = SET_CODE_TO_TCGDEX[card.setCode];
  if (!base || !card.localId) return null;
  const raw = card.localId.trim();
  return `${base}-${normalizeSuffix(base, raw)}`;
}

type TcgdexCardPayload = {
  regulationMark?: string | null;
  id?: string;
  title?: string;
};

async function fetchTcgdexCard(id: string): Promise<TcgdexCardPayload | null> {
  const url = `${TCGDEX_BASE}/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const data = (await res.json()) as TcgdexCardPayload & { type?: string };
  if (data.type?.includes("not-found")) return null;
  return data;
}

async function main() {
  const files = fs
    .readdirSync(CARDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/u, ""))
    .filter((code) => !ONLY_SETS || ONLY_SETS.includes(code));

  let updated = 0;
  let skippedHasMark = 0;
  let skippedNoId = 0;
  let skippedNoRemoteMark = 0;
  let errors = 0;

  for (const setCode of files.sort()) {
    const tcgdxBase = SET_CODE_TO_TCGDEX[setCode];
    if (!tcgdxBase) continue;

    const filePath = path.join(CARDS_DIR, `${setCode}.json`);
    const cards: CardJsonEntry[] = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let setUpdated = 0;

    for (const card of cards) {
      if (!isMissingMark(card)) {
        skippedHasMark++;
        continue;
      }

      const candidateIds: string[] = [];
      const primary = buildTcgdexCardId(card);
      if (primary) candidateIds.push(primary);
      const fallback = buildTcgdexCardIdFromLocalId(card);
      if (fallback && fallback !== primary) candidateIds.push(fallback);

      if (candidateIds.length === 0) {
        skippedNoId++;
        continue;
      }

      let remote: TcgdexCardPayload | null = null;
      try {
        for (const cid of candidateIds) {
          remote = await fetchTcgdexCard(cid);
          await sleep(75);
          if (remote?.regulationMark != null && String(remote.regulationMark).trim() !== "") {
            break;
          }
          remote = null;
        }
      } catch (e) {
        errors++;
        console.error(setCode, card.externalId ?? card.localId, e);
        continue;
      }

      const mark = remote?.regulationMark;
      if (mark == null || String(mark).trim() === "") {
        skippedNoRemoteMark++;
        continue;
      }

      const normalizedMark = String(mark).trim().toUpperCase();
      if (!DRY_RUN) {
        card.regulationMark = normalizedMark;
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
        updated,
        skippedHasMark,
        skippedNoId,
        skippedNoRemoteMark,
        errors,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
