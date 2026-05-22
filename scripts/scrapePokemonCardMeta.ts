/**
 * Enrich Pokémon card JSON in r2_backup from Scrydex card pages (embedded API JSON + HTML).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/scrapePokemonCardMeta.ts --set=me4,mep
 *   npx tsx --env-file=.env.local scripts/scrapePokemonCardMeta.ts --set=me4 --dry-run
 */

import { loadEnvFilesFromRepoRoot } from "../nightly-scrape/loadEnvFromRepoRoot.js";
import { runScrapePokemonCardMeta } from "../nightly-scrape/jobScrapePokemonCardMeta.js";

loadEnvFilesFromRepoRoot(import.meta.url);

const dryRun = process.argv.includes("--dry-run");
const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

if (!onlySetCodes?.length) {
  console.error("Usage: --set=me4 or --set=me4,mep");
  process.exit(1);
}

runScrapePokemonCardMeta({ dryRun, onlySetCodes }).catch((err) => {
  console.error(err);
  process.exit(1);
});
