/**
 * Re-derives and re-uploads price trend summaries from existing price history.
 * Use this after changes to trend calculation logic (e.g. adding allVariants).
 * Does NOT re-scrape prices — reads history from R2 and re-computes trends only.
 *
 * Usage:
 *   node --import tsx/esm scripts/rebuildPriceTrends.ts
 *   node --import tsx/esm scripts/rebuildPriceTrends.ts --dry-run
 *   node --import tsx/esm scripts/rebuildPriceTrends.ts --set=sv1
 *   node --import tsx/esm scripts/rebuildPriceTrends.ts --set=sv1,sv2
 *   node --import tsx/esm scripts/rebuildPriceTrends.ts --series="Scarlet & Violet"
 */

import fs from "fs";
import path from "path";
import { S3Client } from "@aws-sdk/client-s3";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import { getPriceHistoryForSet } from "../lib/r2PriceHistory";
import { uploadPriceTrends } from "../lib/r2PriceTrends";
import type { SetJsonEntry, SeriesJsonEntry } from "../lib/staticDataTypes";

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

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

const DATA_DIR = path.join(process.cwd(), "data");

function buildS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT ?? "",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
    region: process.env.R2_REGION ?? "auto",
  });
}

async function run() {
  const allSets = readJson<SetJsonEntry[]>(path.join(DATA_DIR, "sets.json"));
  let sets = allSets;

  if (onlySetCodes?.length) {
    const allowed = new Set(onlySetCodes.map((s) => s.toLowerCase()));
    sets = allSets.filter(
      (s) =>
        (s.code && allowed.has(s.code.toLowerCase())) ||
        (s.tcgdexId && allowed.has(s.tcgdexId.toLowerCase())),
    );
    if (!sets.length) throw new Error(`No sets found matching: ${onlySetCodes.join(", ")}`);
  } else if (onlySeriesNames?.length) {
    const allSeries = readJson<SeriesJsonEntry[]>(path.join(DATA_DIR, "series.json"));
    const matchedSeries = new Set(
      allSeries
        .filter((sr) => onlySeriesNames.some((n) => n.toLowerCase() === sr.name.toLowerCase()))
        .map((sr) => sr.name),
    );
    if (!matchedSeries.size) throw new Error(`No series found matching: ${onlySeriesNames.join(", ")}`);
    sets = allSets.filter((s) => s.seriesName && matchedSeries.has(s.seriesName));
    if (!sets.length) throw new Error(`No sets found in series: ${[...matchedSeries].join(", ")}`);
  }

  const scopeLabel = onlySetCodes?.length
    ? `sets: ${onlySetCodes.join(", ")}`
    : onlySeriesNames?.length
      ? `series: ${onlySeriesNames.join(", ")}`
      : "all sets";

  console.log(`=== Rebuild price trends (${scopeLabel}) ===`);
  if (dryRun) console.log("(dry-run: no R2 uploads)\n");

  const s3 = buildS3Client();
  let updated = 0;
  let skipped = 0;

  for (const set of sets) {
    const setCode = set.code ?? set.tcgdexId;
    if (!setCode) continue;

    const historyMap = await getPriceHistoryForSet(setCode);
    if (!historyMap || Object.keys(historyMap).length === 0) {
      console.log(`  [${setCode}] skip — no history found`);
      skipped++;
      continue;
    }

    const cardCount = Object.keys(historyMap).length;
    if (dryRun) {
      console.log(`  [${setCode}] ${cardCount} cards (dry-run — skipping upload)`);
    } else {
      await uploadPriceTrends(s3, setCode, historyMap);
      console.log(`  [${setCode}] ${cardCount} cards → trends updated`);
    }
    updated++;
  }

  console.log(`\nDone. ${updated} sets updated, ${skipped} skipped.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
