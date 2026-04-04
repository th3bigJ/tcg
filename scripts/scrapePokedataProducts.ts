/**
 * Scrape Pokedata.io for sealed product catalog and/or pricing.
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapePokedataProducts.ts
 *   node --import tsx/esm scripts/scrapePokedataProducts.ts --mode=products
 *   node --import tsx/esm scripts/scrapePokedataProducts.ts --mode=prices
 *   node --import tsx/esm scripts/scrapePokedataProducts.ts --mode=prices --tcg=Pokemon --language=ENGLISH
 */

import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import { runScrapePokedataProducts } from "../lib/jobs/jobScrapePokedataProducts";

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
const mode = modeRaw as "all" | "products" | "prices";
const tcg = readArgValue("--tcg=") || undefined;
const language = readArgValue("--language=") || undefined;
const imageConcurrency = parsePositiveInt(readArgValue("--image-concurrency="));
const skipExistingImages = !process.argv.includes("--force-images");

runScrapePokedataProducts({ mode, tcg, language, imageConcurrency, skipExistingImages }).catch(
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
