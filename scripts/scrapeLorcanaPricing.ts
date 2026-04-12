/**
 * Scrape current Lorcana Near Mint USD prices from Scrydex card pages.
 * Writes market + merged daily history + trends:
 *   - Default (R2): lorcana/pricing/{market,history,trends}/{setCode}.json on R2
 *   - Local: set LORCANA_PRICING_LOCAL=1 → same paths under repo `data/lorcana/pricing/`
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeLorcanaPricing.ts
 *   LORCANA_PRICING_LOCAL=1 node --import tsx/esm scripts/scrapeLorcanaPricing.ts
 *   node --import tsx/esm scripts/scrapeLorcanaPricing.ts --dry-run
 *   node --import tsx/esm scripts/scrapeLorcanaPricing.ts --set=TFC
 *   node --import tsx/esm scripts/scrapeLorcanaPricing.ts --set=TFC,P1
 */

import { runScrapeLorcanaPricing } from "../lib/jobs/jobScrapeLorcanaPricing";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const dryRun = process.argv.includes("--dry-run");
const setArg = process.argv.find((arg) => arg.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((value) => value.trim()).filter(Boolean)
  : undefined;

runScrapeLorcanaPricing({ dryRun, onlySetCodes }).catch((error) => {
  console.error(error);
  process.exit(1);
});
