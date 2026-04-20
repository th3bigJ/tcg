/**
 * Rebuilds SVE / MEE card JSON with enriched metadata (TCGdex + Pokémon TCG API images for SVE 001–016)
 * while preserving existing masterCardId values.
 *
 * Usage: node --import tsx/esm scripts/refreshPokemonEnergySets.ts
 */

import fs from "fs";
import path from "path";
import type { CardJsonEntry, SetJsonEntry } from "../lib/staticDataTypes";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";
import {
  buildEnergySetCards,
  fetchPtgSveCard,
} from "./pokemonEnergySetsShared";

const CARDS_DIR = path.join(pokemonLocalDataRoot, "cards");
const SETS_FILE = path.join(pokemonLocalDataRoot, "sets.json");

const SVE_PATH = path.join(CARDS_DIR, "sve.json");
const MEE_PATH = path.join(CARDS_DIR, "mee.json");

/** Official assets (Pokémon TCG API / pokemontcg.io mirror). */
const SVE_OFFICIAL_LOGO = "https://images.pokemontcg.io/sve/logo.png";
const SVE_OFFICIAL_SYMBOL = "https://images.pokemontcg.io/sve/symbol.png";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function masterIdMapFromCards(path: string): Map<string, string> {
  const cards = readJson<CardJsonEntry[]>(path);
  const m = new Map<string, string>();
  for (const c of cards) {
    const lid = (c.localId ?? "").trim();
    if (lid) m.set(lid, c.masterCardId);
  }
  return m;
}

async function main(): Promise<void> {
  if (!fs.existsSync(SVE_PATH) || !fs.existsSync(MEE_PATH)) {
    throw new Error(`Missing ${SVE_PATH} or ${MEE_PATH} — run seed:pokemon-energy-sets first.`);
  }

  const sveIds = masterIdMapFromCards(SVE_PATH);
  const meeIds = masterIdMapFromCards(MEE_PATH);

  const sve = await buildEnergySetCards({
    tcgdxSetId: "sve",
    setKey: "sve",
    abbrevUpper: "SVE",
    fetchPtg: fetchPtgSveCard,
    assignMasterId: (localId, _index) => {
      const id = sveIds.get(localId);
      if (!id) throw new Error(`sve.json missing masterCardId for localId ${localId}`);
      return id;
    },
  });

  const mee = await buildEnergySetCards({
    tcgdxSetId: "mee",
    setKey: "mee",
    abbrevUpper: "MEE",
    fetchPtg: undefined,
    assignMasterId: (localId, _index) => {
      const id = meeIds.get(localId);
      if (!id) throw new Error(`mee.json missing masterCardId for localId ${localId}`);
      return id;
    },
  });

  writeJson(SVE_PATH, sve);
  writeJson(MEE_PATH, mee);

  const sets = readJson<SetJsonEntry[]>(SETS_FILE);
  let patched = false;
  for (const row of sets) {
    if (row.setKey === "sve") {
      row.logoSrc = SVE_OFFICIAL_LOGO;
      row.symbolSrc = SVE_OFFICIAL_SYMBOL;
      patched = true;
      break;
    }
  }
  if (!patched) console.warn("sets.json: no setKey sve found — skipped logo/symbol update");

  writeJson(SETS_FILE, sets);

  console.log(`Refreshed ${sve.length} sve + ${mee.length} mee cards (masterCardIds preserved).`);
}

await main();
