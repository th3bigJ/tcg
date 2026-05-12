/**
 * Migrates existing per-set price-history files into the new flat daily/weekly/monthly layout.
 *
 * Source:  r2_backup/pricing/price-history/{setCode}.json
 *          Each file: SetPriceHistoryMap — cardId → variant → grade → { daily, weekly, monthly }
 *          daily points:   [["2026-04-03", price], ...]   (up to 40)
 *          weekly points:  [["2026-W14",  price], ...]   (up to 52)
 *          monthly points: [["2026-04",   price], ...]   (up to 60)
 *
 * Output:  r2_backup/new_pricing/daily/{YYYY-MM-DD}.json
 *          r2_backup/new_pricing/weekly/{YYYY-Www}.json
 *          r2_backup/new_pricing/monthly/{YYYY-MM}.json
 *          Each file: { [cardId]: { [variant]: { [grade]: price } } }
 */

import fs from "fs";
import path from "path";

const PRICE_HISTORY_DIR = path.join(process.cwd(), "r2_backup/pricing/price-history");
const OUT_DAILY = path.join(process.cwd(), "r2_backup/new_pricing/daily");
const OUT_WEEKLY = path.join(process.cwd(), "r2_backup/new_pricing/weekly");
const OUT_MONTHLY = path.join(process.cwd(), "r2_backup/new_pricing/monthly");

type PriceHistoryPoint = [string, number];
type PriceHistoryWindow = {
  daily: PriceHistoryPoint[];
  weekly: PriceHistoryPoint[];
  monthly: PriceHistoryPoint[];
};
type CardPriceHistory = Record<string, Record<string, PriceHistoryWindow>>;
type SetPriceHistoryMap = Record<string, CardPriceHistory>;

// bucket key → cardId → variant → grade → price
type BucketAccumulator = Map<string, Record<string, Record<string, Record<string, number>>>>;

function ensureDirs() {
  for (const dir of [OUT_DAILY, OUT_WEEKLY, OUT_MONTHLY]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadSetFile(filePath: string): SetPriceHistoryMap {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SetPriceHistoryMap;
}

function addPoint(
  acc: BucketAccumulator,
  bucketKey: string,
  cardId: string,
  variant: string,
  grade: string,
  price: number,
) {
  let cardMap = acc.get(bucketKey);
  if (!cardMap) {
    cardMap = {};
    acc.set(bucketKey, cardMap);
  }
  cardMap[cardId] ??= {};
  cardMap[cardId][variant] ??= {};
  // When the same card/variant/grade appears in multiple sets (shouldn't happen but just in case),
  // keep the higher price as the canonical value.
  const existing = cardMap[cardId][variant][grade];
  cardMap[cardId][variant][grade] = existing === undefined ? price : Math.max(existing, price);
}

function writeBuckets(acc: BucketAccumulator, outDir: string) {
  let written = 0;
  for (const [bucketKey, cardMap] of acc) {
    const filePath = path.join(outDir, `${bucketKey}.json`);
    fs.writeFileSync(filePath, JSON.stringify(cardMap));
    written++;
  }
  return written;
}

function main() {
  ensureDirs();

  const daily: BucketAccumulator = new Map();
  const weekly: BucketAccumulator = new Map();
  const monthly: BucketAccumulator = new Map();

  const setFiles = fs.readdirSync(PRICE_HISTORY_DIR).filter((f) => f.endsWith(".json"));
  console.log(`Processing ${setFiles.length} set files...`);

  for (const filename of setFiles) {
    const setCode = filename.replace(".json", "");
    const filePath = path.join(PRICE_HISTORY_DIR, filename);
    let setMap: SetPriceHistoryMap;
    try {
      setMap = loadSetFile(filePath);
    } catch (e) {
      console.warn(`  Skipping ${filename}: ${(e as Error).message}`);
      continue;
    }

    for (const [cardId, cardHist] of Object.entries(setMap)) {
      for (const [variant, grades] of Object.entries(cardHist)) {
        for (const [grade, window] of Object.entries(grades)) {
          for (const [bucketKey, price] of window.daily) {
            if (typeof price === "number" && Number.isFinite(price)) {
              addPoint(daily, bucketKey, cardId, variant, grade, price);
            }
          }
          for (const [bucketKey, price] of window.weekly) {
            if (typeof price === "number" && Number.isFinite(price)) {
              addPoint(weekly, bucketKey, cardId, variant, grade, price);
            }
          }
          for (const [bucketKey, price] of window.monthly) {
            if (typeof price === "number" && Number.isFinite(price)) {
              addPoint(monthly, bucketKey, cardId, variant, grade, price);
            }
          }
        }
      }
    }

    process.stdout.write(`  ${setCode} done\n`);
  }

  console.log("\nWriting output files...");
  const dCount = writeBuckets(daily, OUT_DAILY);
  const wCount = writeBuckets(weekly, OUT_WEEKLY);
  const mCount = writeBuckets(monthly, OUT_MONTHLY);

  console.log(`Done.`);
  console.log(`  daily:   ${dCount} files`);
  console.log(`  weekly:  ${wCount} files`);
  console.log(`  monthly: ${mCount} files`);
}

main();
