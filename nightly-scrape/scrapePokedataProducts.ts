/**
 * Scrape Pokedata.io for sealed product catalog and/or pricing.
 *
 * Usage:
 *   node --import tsx/esm scrapePokedataProducts.ts
 *   node --import tsx/esm scrapePokedataProducts.ts --mode=products
 *   node --import tsx/esm scrapePokedataProducts.ts --mode=prices
 *   node --import tsx/esm scrapePokedataProducts.ts --mode=prices --tcg=Pokemon --language=ENGLISH
 *   node --import tsx/esm scrapePokedataProducts.ts --mode=incremental --since=2026-03-30 --until=2026-05-22
 */

import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import { runScrapePokedataProducts } from "./jobScrapePokedataProducts";

loadEnvFilesFromRepoRoot(import.meta.url);

function readArgValue(prefix: string): string {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

function parsePositiveInt(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

const modeRaw = readArgValue("--mode=") || "all";
const mode = modeRaw as "all" | "products" | "prices" | "incremental";
const tcg = readArgValue("--tcg=") || undefined;
const language = readArgValue("--language=") || undefined;
const since = readArgValue("--since=") || undefined;
const until = readArgValue("--until=") || undefined;
const imageConcurrency = parsePositiveInt(readArgValue("--image-concurrency="));
const skipExistingImages = !process.argv.includes("--force-images");

runScrapePokedataProducts({ mode, tcg, language, since, until, imageConcurrency, skipExistingImages }).catch(
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
