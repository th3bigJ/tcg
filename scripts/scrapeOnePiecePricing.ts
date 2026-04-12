/**
 * Scrape current One Piece Near Mint USD prices from Scrydex card pages.
 * Writes market + merged daily history + trends:
 *   - Default (R2): onepiece/pricing/{market,history,trends}/{setCode}.json on R2
 *   - Local: set ONEPIECE_PRICING_LOCAL=1 → same paths under repo `onepiece/pricing/`
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeOnePiecePricing.ts
 *   ONEPIECE_PRICING_LOCAL=1 node --import tsx/esm scripts/scrapeOnePiecePricing.ts
 *   node --import tsx/esm scripts/scrapeOnePiecePricing.ts --dry-run
 *   node --import tsx/esm scripts/scrapeOnePiecePricing.ts --set=OP01
 *   node --import tsx/esm scripts/scrapeOnePiecePricing.ts --set=OP01,PRB01
 */

import { runScrapeOnePiecePricing } from "../lib/jobs/jobScrapeOnePiecePricing";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const dryRun = process.argv.includes("--dry-run");
const setArg = process.argv.find((arg) => arg.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((value) => value.trim()).filter(Boolean)
  : undefined;

runScrapeOnePiecePricing({ dryRun, onlySetCodes }).catch((error) => {
  console.error(error);
  process.exit(1);
});
