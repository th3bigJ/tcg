/**
 * Reads local `data/pricing/card-pricing/{setKey}.json` and writes `pricingVariants` onto each row in
 * `data/cards/{setKey}.json`. Use after `npm run r2:download-static-data` or whenever card-pricing was
 * updated without running `scrape:pricing` (the scrape job merges variants automatically).
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillCardPricingVariants.ts
 *   node --import tsx/esm scripts/backfillCardPricingVariants.ts --set=sv1,sv2
 *   node --import tsx/esm scripts/backfillCardPricingVariants.ts --dry-run
 */

import fs from "fs";
import path from "path";
import type { CardJsonEntry, SetJsonEntry, SetPricingMap } from "../lib/staticDataTypes";
import { applyPricingVariantsToCardsInPlace } from "../lib/applyPricingVariantsToCardJson";
import { setRowMatchesAllowedSetCodes } from "../lib/scrydexPrefixCandidatesForSet";

const DATA = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA, "cards");
const PRICING_DIR = path.join(DATA, "pricing", "card-pricing");

const dryRun = process.argv.includes("--dry-run");
const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function main(): void {
  const setsPath = path.join(DATA, "sets.json");
  if (!fs.existsSync(setsPath)) {
    console.error(`Missing ${setsPath}`);
    process.exit(1);
  }

  let sets = readJson<SetJsonEntry[]>(setsPath);
  if (onlySetCodes?.length) {
    sets = sets.filter((s) => setRowMatchesAllowedSetCodes(s, onlySetCodes));
    if (!sets.length) {
      console.error(`No sets match: ${onlySetCodes.join(", ")}`);
      process.exit(1);
    }
  }

  let updatedFiles = 0;
  let skipped = 0;

  for (const set of sets) {
    const setKey = set.setKey;
    const cardsPath = path.join(CARDS_DIR, `${setKey}.json`);
    const pricingPath = path.join(PRICING_DIR, `${setKey}.json`);

    if (!fs.existsSync(cardsPath)) {
      skipped += 1;
      continue;
    }
    if (!fs.existsSync(pricingPath)) {
      console.log(`  [${setKey}] skip — no ${pricingPath}`);
      skipped += 1;
      continue;
    }

    const pricingMap = readJson<SetPricingMap>(pricingPath);
    const cards = readJson<CardJsonEntry[]>(cardsPath);
    const changed = applyPricingVariantsToCardsInPlace(cards, pricingMap);

    if (!changed) {
      console.log(`  [${setKey}] unchanged`);
      continue;
    }

    if (dryRun) {
      console.log(`  [${setKey}] would write pricingVariants (${cards.length} cards) — dry-run`);
      updatedFiles += 1;
      continue;
    }

    fs.writeFileSync(cardsPath, `${JSON.stringify(cards, null, 2)}\n`, "utf-8");
    console.log(`  [${setKey}] wrote pricingVariants`);
    updatedFiles += 1;
  }

  console.log(`\nDone. Updated ${updatedFiles} file(s); skipped ${skipped} set(s) (no cards or no pricing).`);
  if (dryRun) console.log("(dry-run: no files written)");
}

main();
