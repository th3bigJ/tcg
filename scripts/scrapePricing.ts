/**
 * Scrape Scrydex pricing for all sets, a specific set, or a specific series.
 * Reads sets/cards from R2 (`data/sets.json`, `data/cards/{setCode}.json`), writes pricing + history/trends
 * and merged `pricingVariants` on card JSON back to R2 (`pricing/…`, `data/cards/…`).
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapePricing.ts
 *   node --import tsx/esm scripts/scrapePricing.ts --dry-run
 *   node --import tsx/esm scripts/scrapePricing.ts --set=sv1
 *   node --import tsx/esm scripts/scrapePricing.ts --set=sv1,sv2
 *   node --import tsx/esm scripts/scrapePricing.ts --series="Scarlet & Violet"
 */

import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import { runScrapePricing } from "../lib/jobs/jobScrapePricing";

loadEnvFilesFromRepoRoot(import.meta.url);

const dryRun = process.argv.includes("--dry-run");

const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

const seriesArg = process.argv.find((a) => a.startsWith("--series="));
const onlySeriesNames = seriesArg
  ? seriesArg.slice("--series=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

runScrapePricing({ dryRun, onlySetCodes, onlySeriesNames }).catch((err) => {
  console.error(err);
  process.exit(1);
});
