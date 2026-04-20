/**
 * Seeds Scarlet & Violet Energy (SVE) and Mega Evolution Energy (MEE) from TCGdex metadata,
 * merging Pokémon TCG API official card images for SVE cards 001–016 when available.
 *
 * Human reference: TCGCollector sets 11568 / 11674 (blocked for automated scraping).
 *
 * Usage: node --import tsx/esm scripts/seedPokemonEnergySets.ts
 */

import fs from "fs";
import path from "path";
import type { SetJsonEntry } from "../lib/staticDataTypes";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";
import { buildEnergySetCards, fetchPtgSveCard } from "./pokemonEnergySetsShared";

const CARDS_DIR = path.join(pokemonLocalDataRoot, "cards");
const SETS_FILE = path.join(pokemonLocalDataRoot, "sets.json");

const SVE_OFFICIAL_LOGO = "https://images.pokemontcg.io/sve/logo.png";
const SVE_OFFICIAL_SYMBOL = "https://images.pokemontcg.io/sve/symbol.png";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const MEE_ROW: SetJsonEntry = {
  id: "586",
  name: "Mega Evolution Energy",
  releaseDate: "2025-09-25T00:00:00.000Z",
  cardCountTotal: 8,
  cardCountOfficial: 8,
  seriesName: "Mega Evolution",
  logoSrc: "https://s3.limitlesstcg.com/sets/en/MEE_MD.png",
  symbolSrc: null,
  setKey: "mee",
};

const SVE_ROW: SetJsonEntry = {
  id: "587",
  name: "Scarlet & Violet Energy",
  releaseDate: "2023-03-31T00:00:00.000Z",
  cardCountTotal: 24,
  cardCountOfficial: 24,
  seriesName: "Scarlet & Violet",
  logoSrc: SVE_OFFICIAL_LOGO,
  symbolSrc: SVE_OFFICIAL_SYMBOL,
  setKey: "sve",
};

async function main(): Promise<void> {
  fs.mkdirSync(CARDS_DIR, { recursive: true });

  let nextMaster = 22545;

  const sve = await buildEnergySetCards({
    tcgdxSetId: "sve",
    setKey: "sve",
    abbrevUpper: "SVE",
    fetchPtg: fetchPtgSveCard,
    assignMasterId: (_localId, _index) => String(nextMaster++),
  });

  const mee = await buildEnergySetCards({
    tcgdxSetId: "mee",
    setKey: "mee",
    abbrevUpper: "MEE",
    fetchPtg: undefined,
    assignMasterId: (_localId, _index) => String(nextMaster++),
  });

  writeJson(path.join(CARDS_DIR, "sve.json"), sve);
  writeJson(path.join(CARDS_DIR, "mee.json"), mee);

  const sets = readJson<SetJsonEntry[]>(SETS_FILE);
  const keys = new Set(sets.map((s) => s.setKey));
  if (keys.has("sve") || keys.has("mee")) {
    throw new Error("sets.json already contains sve or mee — remove duplicates before re-running.");
  }

  const insertAfter = (rows: SetJsonEntry[], afterSetKey: string, block: SetJsonEntry): SetJsonEntry[] => {
    const idx = rows.findIndex((s) => s.setKey === afterSetKey);
    if (idx < 0) throw new Error(`Could not find setKey ${afterSetKey}`);
    return [...rows.slice(0, idx + 1), block, ...rows.slice(idx + 1)];
  };

  let merged = insertAfter(sets, "me1", MEE_ROW);
  merged = insertAfter(merged, "sv1", SVE_ROW);

  writeJson(SETS_FILE, merged);

  console.log(`Wrote ${sve.length} sve + ${mee.length} mee cards; updated sets.json`);
}

await main();
