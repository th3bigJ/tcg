/**
 * Legacy maintenance: ensure each `data/pokemon/cards/{set.setKey}.json` uses `setCode` matching `sets.setKey`,
 * strips removed TCGdex mirror fields (`tcgdex_id`, `setTcgdexId`), and drops other stale keys.
 *
 * Earlier versions also renamed files from tcg codes → Scrydex keys; that is already reflected
 * in the committed `data/` tree.
 *
 * Usage: npx tsx scripts/migrateSinglesCatalogToScrydexKeys.ts
 *        DRY_RUN=1 npx tsx scripts/migrateSinglesCatalogToScrydexKeys.ts
 */

import fs from "fs";
import path from "path";
import type { CardJsonEntry, SetJsonEntry } from "../lib/staticDataTypes";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const DRY_RUN = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
const ROOT = process.cwd();
const DATA_DIR = pokemonLocalDataRoot;
const SETS_PATH = path.join(DATA_DIR, "sets.json");
const CARDS_DIR = path.join(DATA_DIR, "cards");

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

function main(): void {
  const sets = readJson<SetJsonEntry[]>(SETS_PATH);

  for (const set of sets) {
    const catalogKey = (set.setKey ?? "").trim();
    if (!catalogKey) {
      console.warn(`skip set row with empty setKey: ${set.name}`);
      continue;
    }
    const cardsPath = path.join(CARDS_DIR, `${catalogKey}.json`);
    if (!fs.existsSync(cardsPath)) {
      console.warn(`missing cards file for set ${set.name}: ${catalogKey}.json`);
      continue;
    }
    const cards = readJson<CardJsonEntry[]>(cardsPath);
    let touched = false;
    for (const c of cards) {
      if (c.setCode !== catalogKey) {
        c.setCode = catalogKey;
        touched = true;
      }
      for (const k of ["tcgdex_id", "setTcgdexId"] as const) {
        if (k in c) {
          delete (c as Record<string, unknown>)[k];
          touched = true;
        }
      }
      for (const k of ["stage", "isActive", "noPricing", "evolveFrom", "subtypes"] as const) {
        if (k in c && c[k as keyof typeof c] !== undefined) {
          delete (c as Record<string, unknown>)[k];
          touched = true;
        }
      }
    }
    if (touched) {
      if (DRY_RUN) {
        console.log(`[dry-run] would rewrite ${cards.length} cards in ${catalogKey}.json`);
      } else {
        fs.writeFileSync(cardsPath, `${JSON.stringify(cards)}\n`, "utf-8");
        console.log(`updated ${catalogKey}.json (${cards.length} cards)`);
      }
    }
  }

  if (DRY_RUN) {
    console.log("[dry-run] no sets.json changes");
  }
}

main();
