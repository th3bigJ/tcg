/**
 * Enrich local card JSON from Scrydex card pages (mirrors to R2 via `npm run r2:upload-static-data`).
 *
 * For each card with a resolvable Scrydex URL:
 * - Sets `externalId` to Scrydex `id`
 * - Overwrites `cardNumber` when Scrydex `printed_number` is present
 * - Sets `attacks` (name + damage) and `rules` (Trainers) from the page
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeScrydexCardMeta.ts
 *   node --import tsx/esm scripts/scrapeScrydexCardMeta.ts --dry-run
 *   node --import tsx/esm scripts/scrapeScrydexCardMeta.ts --set=sv1
 *   node --import tsx/esm scripts/scrapeScrydexCardMeta.ts --series="Scarlet & Violet"
 *   node --import tsx/esm scripts/scrapeScrydexCardMeta.ts --series="..." --batch-name="Batch 1"
 */

import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import { runScrapeScrydexCardMeta } from "../lib/jobs/jobScrapeScrydexCardMeta";

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

const batchArg = process.argv.find((a) => a.startsWith("--batch-name="));
const batchLabel = batchArg ? batchArg.slice("--batch-name=".length).trim() : undefined;

runScrapeScrydexCardMeta({ dryRun, onlySetCodes, onlySeriesNames, batchLabel }).catch((err) => {
  console.error(err);
  process.exit(1);
});
