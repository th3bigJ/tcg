/**
 * Full local refresh of One Piece static data + pricing (no R2 uploads).
 *
 * Writes under `data/onepiece/`:
 *   - sets/data/sets.json, sets/images/
 *   - cards/data/{set}.json, cards/images/{set}/
 *   - pricing/market|history|trends/{set}.json  (when ONEPIECE_PRICING_LOCAL is set for pricing steps)
 *
 * Steps:
 *   1. scrapeOnePieceSets      (SKIP_ONEPIECE_R2=1)
 *   2. scrapeOnePieceCards     (SKIP_ONEPIECE_R2=1)
 *   3. scrapeOnePiecePricing   (ONEPIECE_PRICING_LOCAL=1 — Scrydex NM prices → market + daily history merge)
 *   4. backfillOnePiecePriceHistory (ONEPIECE_PRICING_LOCAL=1 — merge chart history into local files)
 *
 * Usage (repo root, leave running):
 *   node --import tsx/esm scripts/fullRescrapeOnePieceLocal.ts
 *   node --import tsx/esm scripts/fullRescrapeOnePieceLocal.ts --dry-run
 *   node --import tsx/esm scripts/fullRescrapeOnePieceLocal.ts --no-images
 *   node --import tsx/esm scripts/fullRescrapeOnePieceLocal.ts --skip-sets --skip-cards
 *
 * After it finishes, upload to R2:
 *   npm run r2:upload-onepiece
 *
 * Env (optional): forwards to child scripts; pricing uses ONEPIECE_PRICING_LOCAL automatically.
 */

import { spawnSync } from "node:child_process";
import path from "path";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const REPO_ROOT = process.cwd();
const NODE = process.execPath;

const ORCHESTRATOR_FLAGS = new Set([
  "--dry-run",
  "--no-images",
  "--skip-sets",
  "--skip-cards",
  "--skip-pricing",
  "--skip-history",
  "--help",
  "-h",
]);

function parseArgs(): {
  dryRun: boolean;
  noImages: boolean;
  skipSets: boolean;
  skipCards: boolean;
  skipPricing: boolean;
  skipHistory: boolean;
  passthrough: string[];
} {
  const raw = process.argv.slice(2);
  const dryRun = raw.includes("--dry-run");
  const noImages = raw.includes("--no-images");
  const skipSets = raw.includes("--skip-sets");
  const skipCards = raw.includes("--skip-cards");
  const skipPricing = raw.includes("--skip-pricing");
  const skipHistory = raw.includes("--skip-history");
  const passthrough = raw.filter((a) => !ORCHESTRATOR_FLAGS.has(a));
  return { dryRun, noImages, skipSets, skipCards, skipPricing, skipHistory, passthrough };
}

function runStep(
  title: string,
  scriptRelative: string,
  args: string[],
  extraEnv: Record<string, string>,
): void {
  const scriptPath = path.join(REPO_ROOT, scriptRelative);
  const fullArgs = ["--import", "tsx/esm", scriptPath, ...args];
  console.log(`\n${"=".repeat(72)}`);
  console.log(`▶ ${title}`);
  console.log(`  ${["node", ...fullArgs].join(" ")}`);
  if (Object.keys(extraEnv).length) {
    console.log(`  env: ${JSON.stringify(extraEnv)}`);
  }
  console.log(`${"=".repeat(72)}\n`);

  const result = spawnSync(NODE, fullArgs, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== null) {
    console.error(`\n✗ Step failed: ${title} (exit ${result.status})`);
    process.exit(result.status);
  }
}

function main(): void {
  const args = parseArgs();
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node --import tsx/esm scripts/fullRescrapeOnePieceLocal.ts [options] [extra args…]

Options:
  --dry-run        Pass through to each step (no writes where supported)
  --no-images      Card scrape skips image downloads (faster)
  --skip-sets      Skip set catalog + set images
  --skip-cards     Skip card JSON + card images
  --skip-pricing   Skip Scrydex market scrape
  --skip-history   Skip NM history backfill merge

Extra args (e.g. --set=OP15) are forwarded to card scrape, pricing scrape, and history backfill.

After completion:
  npm run r2:upload-onepiece
`);
    process.exit(0);
  }

  const { dryRun, noImages, skipSets, skipCards, skipPricing, skipHistory, passthrough } = args;

  const common: string[] = [];
  if (dryRun) common.push("--dry-run");

  const setsArgs = [...common, ...passthrough];
  const cardsArgs = [...common, ...(noImages ? ["--no-images"] : []), ...passthrough];
  const pricingArgs = [...common, ...passthrough];
  const historyArgs = [...common, ...passthrough];

  const skipR2 = { SKIP_ONEPIECE_R2: "1" };
  const localPricing = { ONEPIECE_PRICING_LOCAL: "1" };

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  One Piece — full local rescrape (sets → cards → pricing → history)     ║
║  R2 is not used; upload later: npm run r2:upload-onepiece                ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  if (!skipSets) {
    runStep("1/4 — Scrape sets (Scrydex + TCGPlayer → sets.json, set images)", "scripts/scrapeOnePieceSets.ts", setsArgs, skipR2);
  } else {
    console.log("\n○ Skipping sets (--skip-sets)\n");
  }

  if (!skipCards) {
    runStep("2/4 — Scrape cards (per set → cards/data, card images)", "scripts/scrapeOnePieceCards.ts", cardsArgs, skipR2);
  } else {
    console.log("\n○ Skipping cards (--skip-cards)\n");
  }

  if (!skipPricing) {
    runStep(
      "3/4 — Scrape current prices (Scrydex → data/onepiece/pricing/market + history + trends, local files)",
      "scripts/scrapeOnePiecePricing.ts",
      pricingArgs,
      localPricing,
    );
  } else {
    console.log("\n○ Skipping pricing scrape (--skip-pricing)\n");
  }

  if (!skipHistory) {
    runStep(
      "4/4 — Backfill NM price history (merge into data/onepiece/pricing/history + trends, local files)",
      "scripts/backfillOnePiecePriceHistory.ts",
      historyArgs,
      localPricing,
    );
  } else {
    console.log("\n○ Skipping history backfill (--skip-history)\n");
  }

  console.log(`
Done.

Local outputs:
  data/onepiece/sets/data/sets.json
  data/onepiece/sets/images/
  data/onepiece/cards/data/*.json
  data/onepiece/cards/images/*/
  data/onepiece/pricing/market/*.json
  data/onepiece/pricing/history/*.json
  data/onepiece/pricing/trends/*.json

Upload to R2 when ready:
  npm run r2:upload-onepiece
`);
}

main();
