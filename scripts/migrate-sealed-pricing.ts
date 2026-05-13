/**
 * Migrates sealed pricing data to the new layout:
 *
 *  1. Backfills per-period snapshots from the history blob:
 *       new_pricing/sealed/daily/{YYYY-MM-DD}.json   { [productId]: price }
 *       new_pricing/sealed/weekly/{YYYY-Www}.json    { [productId]: price }
 *       new_pricing/sealed/monthly/{YYYY-MM}.json    { [productId]: price }
 *
 *  2. Copies price-trends to the new location:
 *       new_pricing/pokedata-english-pokemon-price-trends.json
 *    → new_pricing/sealed/price-trends.json
 *
 *  3. Deletes the now-redundant files:
 *       new_pricing/pokedata-english-pokemon-prices.json
 *       new_pricing/pokedata-english-pokemon-price-trends.json  (old location)
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/migrate-sealed-pricing.ts
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  region: process.env.R2_REGION || "auto",
  forcePathStyle: true,
});

const bucket = process.env.R2_BUCKET!;
const SLUG = "pokedata-english-pokemon";

const OLD_HISTORY_KEY = `new_pricing/${SLUG}-price-history.json`;
const OLD_TRENDS_KEY = `new_pricing/${SLUG}-price-trends.json`;
const OLD_PRICES_KEY = `new_pricing/${SLUG}-prices.json`;
const NEW_TRENDS_KEY = `new_pricing/sealed/price-trends.json`;

type PriceHistoryPoint = [string, number];
type ProductHistory = { daily: PriceHistoryPoint[]; weekly: PriceHistoryPoint[]; monthly: PriceHistoryPoint[] };
type HistoryMap = Record<string, ProductHistory>;
type Snapshot = Record<string, number>;

async function getJson<T>(key: string): Promise<T | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const raw = await res.Body?.transformToString();
    if (!raw?.trim()) return null;
    return JSON.parse(raw) as T;
  } catch (e: any) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === "NoSuchKey") return null;
    throw e;
  }
}

async function putJson(key: string, data: unknown): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    }),
  );
}

async function deleteKeys(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch } }));
  }
}

async function pool(tasks: (() => Promise<void>)[], concurrency = 20): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < tasks.length) await tasks[next++]();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

// ─── Step 1: backfill snapshots from history blob ─────────────────────────────

async function backfillSnapshots(historyMap: HistoryMap): Promise<void> {
  const daily = new Map<string, Snapshot>();
  const weekly = new Map<string, Snapshot>();
  const monthly = new Map<string, Snapshot>();

  for (const [productId, history] of Object.entries(historyMap)) {
    for (const [key, price] of history.daily) {
      const s = daily.get(key) ?? {}; s[productId] = price; daily.set(key, s);
    }
    for (const [key, price] of history.weekly) {
      const s = weekly.get(key) ?? {}; s[productId] = price; weekly.set(key, s);
    }
    for (const [key, price] of history.monthly) {
      const s = monthly.get(key) ?? {}; s[productId] = price; monthly.set(key, s);
    }
  }

  console.log(`  ${daily.size} daily, ${weekly.size} weekly, ${monthly.size} monthly files to write`);

  const uploads: (() => Promise<void>)[] = [];

  for (const [dateKey, snap] of Array.from(daily)) {
    const key = `new_pricing/sealed/daily/${dateKey}.json`;
    uploads.push(async () => { await putJson(key, snap); console.log(`  wrote ${key}`); });
  }
  for (const [weekKey, snap] of Array.from(weekly)) {
    const key = `new_pricing/sealed/weekly/${weekKey}.json`;
    uploads.push(async () => { await putJson(key, snap); console.log(`  wrote ${key}`); });
  }
  for (const [monthKey, snap] of Array.from(monthly)) {
    const key = `new_pricing/sealed/monthly/${monthKey}.json`;
    uploads.push(async () => { await putJson(key, snap); console.log(`  wrote ${key}`); });
  }

  await pool(uploads);
}

// ─── Step 2: copy trends to new location ─────────────────────────────────────

async function moveTrends(): Promise<void> {
  const trends = await getJson<unknown>(OLD_TRENDS_KEY);
  if (!trends) {
    console.log(`  ${OLD_TRENDS_KEY} not found — skipping`);
    return;
  }
  await putJson(NEW_TRENDS_KEY, trends);
  console.log(`  copied ${OLD_TRENDS_KEY} → ${NEW_TRENDS_KEY}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Step 1: backfill sealed pricing snapshots ===");
  const historyMap = await getJson<HistoryMap>(OLD_HISTORY_KEY);
  if (!historyMap) throw new Error(`History blob not found at ${OLD_HISTORY_KEY}`);
  console.log(`  Loaded ${Object.keys(historyMap).length} products from history blob`);
  await backfillSnapshots(historyMap);

  console.log("\n=== Step 2: move price-trends to new_pricing/sealed/ ===");
  await moveTrends();

  console.log("\n=== Step 3: delete old files ===");
  const toDelete = [OLD_PRICES_KEY, OLD_TRENDS_KEY, OLD_HISTORY_KEY];
  await deleteKeys(toDelete);
  for (const key of toDelete) console.log(`  deleted ${key}`);

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
