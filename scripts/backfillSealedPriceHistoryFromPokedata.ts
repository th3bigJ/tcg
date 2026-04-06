/**
 * Seeds sealed price history from PokeDATA product transaction history.
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillSealedPriceHistoryFromPokedata.ts
 *   node --import tsx/esm scripts/backfillSealedPriceHistoryFromPokedata.ts --dry-run
 *   node --import tsx/esm scripts/backfillSealedPriceHistoryFromPokedata.ts --series="Mega Evolution"
 *   node --import tsx/esm scripts/backfillSealedPriceHistoryFromPokedata.ts --product-id=7419
 */

import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  R2_SEALED_POKEDATA_DEFAULT_SLUG,
  r2SealedPokedataPriceHistoryKey,
} from "../lib/r2BucketLayout";
import {
  mergeDailySeriesIntoWindow,
  type PriceHistoryPoint,
  type SealedProductPriceHistoryMap,
} from "../lib/r2SealedPriceHistory";
import { uploadSealedPriceTrends } from "../lib/r2SealedPriceTrends";

type PokedataProduct = {
  id: number;
  market_value?: number | null;
  name: string;
  release_date?: string | null;
  series?: string | null;
  tcg?: string | null;
  language?: string | null;
};

type ProductTransaction = {
  date_sold?: string | null;
  sold_price?: number | null;
};

type ProductTransactionsPayload = {
  ebay_avg?: ProductTransaction[];
  tcgplayer?: ProductTransaction[];
  transactions?: ProductTransaction[];
};

const SOURCE_API_URL = "https://www.pokedata.io/api/products";
const PRODUCT_TRANSACTIONS_URL = "https://www.pokedata.io/api/product_transactions";
const OUTPUT_DIR = path.join(process.cwd(), "data", "sealed-products");
const ENV_FILE = path.join(process.cwd(), ".env.local");
const DEFAULT_TCG = "Pokemon";
const DEFAULT_LANGUAGE = "ENGLISH";
const HISTORY_KEY = r2SealedPokedataPriceHistoryKey(R2_SEALED_POKEDATA_DEFAULT_SLUG);

const dryRun = process.argv.includes("--dry-run");
const requestedSeriesRaw = readArgValue("--series=");
const requestedProductId = parsePositiveInt(readArgValue("--product-id="));

function readArgValue(prefix: string): string {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

function parsePositiveInt(value: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

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

function getBucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

function ensureOutputDir(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function normalizeSeriesValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

function resolveSeries(product: PokedataProduct): string | null {
  const name = product.name.trim();
  if (name.toLocaleLowerCase().includes("perfect order")) {
    return "Mega Evolution";
  }
  return product.series ?? null;
}

async function fetchProducts(): Promise<PokedataProduct[]> {
  const response = await fetch(SOURCE_API_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_API_URL}: ${response.status} ${response.statusText}`);
  }

  const products = (await response.json()) as unknown;
  if (!Array.isArray(products)) {
    throw new Error("The products API payload was missing or malformed.");
  }

  return products as PokedataProduct[];
}

async function fetchProductTransactions(productId: number): Promise<ProductTransactionsPayload> {
  const url = `${PRODUCT_TRANSACTIONS_URL}?product_id=${encodeURIComponent(String(productId))}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as ProductTransactionsPayload;
}

function dateKeyFromSoldDate(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function collectObservedDateKeys(payload: ProductTransactionsPayload): string[] {
  const keys = new Set<string>();
  const sources = [payload.ebay_avg ?? [], payload.tcgplayer ?? [], payload.transactions ?? []];
  for (const source of sources) {
    for (const row of source) {
      const dateKey = dateKeyFromSoldDate(row.date_sold);
      if (dateKey) keys.add(dateKey);
    }
  }
  return [...keys].sort((left, right) => left.localeCompare(right));
}

function collectKnownDailyAveragePoints(payload: ProductTransactionsPayload): PriceHistoryPoint[] {
  const grouped = new Map<string, { total: number; count: number }>();
  const appendFromSources = (sources: ProductTransaction[][]) => {
    for (const source of sources) {
      for (const row of source) {
        const dateKey = dateKeyFromSoldDate(row.date_sold);
        if (!dateKey) continue;
        if (typeof row.sold_price !== "number" || !Number.isFinite(row.sold_price)) continue;

        const current = grouped.get(dateKey) ?? { total: 0, count: 0 };
        current.total += row.sold_price;
        current.count += 1;
        grouped.set(dateKey, current);
      }
    }
  };

  appendFromSources([payload.ebay_avg ?? [], payload.tcgplayer ?? []]);
  if (grouped.size === 0) {
    appendFromSources([payload.transactions ?? []]);
  }

  return [...grouped.entries()]
    .map(([dateKey, value]) => [dateKey, value.total / value.count] as PriceHistoryPoint)
    .sort((left, right) => left[0].localeCompare(right[0]));
}

function addDays(dateKey: string, delta: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function enumerateDateRange(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  for (let current = startKey; current <= endKey; current = addDays(current, 1)) {
    out.push(current);
  }
  return out;
}

function expandChartLikeDailyPoints(
  knownPoints: PriceHistoryPoint[],
  observedDateKeys: string[],
): PriceHistoryPoint[] {
  if (knownPoints.length === 0) return [];
  const sortedKnown = [...knownPoints].sort((left, right) => left[0].localeCompare(right[0]));
  const knownByDate = new Map(sortedKnown);
  const earliestKnownDate = sortedKnown[0]?.[0] ?? null;
  const latestKnownDate = sortedKnown[sortedKnown.length - 1]?.[0] ?? null;
  if (!earliestKnownDate || !latestKnownDate) return [];

  const sortedObservedDates = [...new Set(observedDateKeys)].sort((left, right) => left.localeCompare(right));
  const startDate = sortedObservedDates[0] && sortedObservedDates[0] < earliestKnownDate
    ? sortedObservedDates[0]
    : earliestKnownDate;
  const endDate = sortedObservedDates[sortedObservedDates.length - 1] &&
    sortedObservedDates[sortedObservedDates.length - 1] > latestKnownDate
      ? sortedObservedDates[sortedObservedDates.length - 1]
      : latestKnownDate;
  const sortedDates = enumerateDateRange(startDate, endDate);

  return sortedDates.map((dateKey) => {
    const exact = knownByDate.get(dateKey);
    if (typeof exact === "number" && Number.isFinite(exact)) {
      return [dateKey, exact] as PriceHistoryPoint;
    }

    let previousKnown: number | null = null;
    for (const [knownDate, price] of sortedKnown) {
      if (knownDate > dateKey) break;
      previousKnown = price;
    }
    if (previousKnown !== null) {
      return [dateKey, previousKnown] as PriceHistoryPoint;
    }

    const nextKnown = sortedKnown.find(([knownDate]) => knownDate >= dateKey)?.[1] ?? null;
    return [dateKey, nextKnown ?? sortedKnown[0]![1]] as PriceHistoryPoint;
  });
}

function collectPrimaryDailyHistoryPoints(payload: ProductTransactionsPayload): PriceHistoryPoint[] {
  const knownPoints = collectKnownDailyAveragePoints(payload);
  const observedDateKeys = collectObservedDateKeys(payload);
  return expandChartLikeDailyPoints(knownPoints, observedDateKeys);
}

function filterProducts(products: PokedataProduct[]): PokedataProduct[] {
  const requestedSeries = normalizeSeriesValue(requestedSeriesRaw);

  return products
    .filter((product) => (product.language ?? "").toUpperCase() === DEFAULT_LANGUAGE)
    .filter((product) => (product.tcg ?? "").toLowerCase() === DEFAULT_TCG.toLowerCase())
    .filter((product) => (requestedProductId ? product.id === requestedProductId : true))
    .filter((product) => {
      if (!requestedSeries) return true;
      return normalizeSeriesValue(resolveSeries(product)) === requestedSeries;
    })
    .sort((left, right) => {
      const rightDate = Date.parse(right.release_date ?? "") || 0;
      const leftDate = Date.parse(left.release_date ?? "") || 0;
      if (rightDate !== leftDate) return rightDate - leftDate;
      return left.name.localeCompare(right.name);
    });
}

function writeLocalJson(filePath: string, payload: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function readLocalHistoryMap(filePath: string): SealedProductPriceHistoryMap {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as SealedProductPriceHistoryMap;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  loadEnvFile(ENV_FILE);
  ensureOutputDir();

  const allProducts = await fetchProducts();
  const products = filterProducts(allProducts);

  const historyUpdates: SealedProductPriceHistoryMap = {};
  let withHistory = 0;

  console.log(
    `=== PokeDATA sealed price-history backfill (${requestedProductId ?? requestedSeriesRaw ?? "all english pokemon"}) ===`,
  );

  for (const [index, product] of products.entries()) {
    const payload = await fetchProductTransactions(product.id);
    const dailyPoints = collectPrimaryDailyHistoryPoints(payload);
    if (dailyPoints.length === 0) {
      if ((index + 1) % 25 === 0 || index === products.length - 1) {
        console.log(`  processed ${index + 1}/${products.length}`);
      }
      continue;
    }

    historyUpdates[String(product.id)] = mergeDailySeriesIntoWindow(undefined, dailyPoints);
    withHistory += 1;

    if ((index + 1) % 25 === 0 || index === products.length - 1) {
      console.log(`  processed ${index + 1}/${products.length} (${withHistory} with history)`);
    }
  }

  const localHistoryPath = path.join(OUTPUT_DIR, "pokedata-english-pokemon-price-history.json");
  const shouldMergeWithExisting = Boolean(requestedProductId || requestedSeriesRaw);
  const historyMap = shouldMergeWithExisting
    ? { ...readLocalHistoryMap(localHistoryPath), ...historyUpdates }
    : historyUpdates;
  writeLocalJson(localHistoryPath, historyMap);

  if (dryRun) {
    console.log(`Dry run complete. Wrote ${path.relative(process.cwd(), localHistoryPath)} only.`);
    return;
  }

  const s3 = buildS3Client();
  const bucket = getBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: HISTORY_KEY,
      Body: JSON.stringify(historyMap),
      ContentType: "application/json",
    }),
  );
  await uploadSealedPriceTrends(s3, historyMap);

  console.log(`Uploaded sealed history for ${withHistory} products to R2 ${HISTORY_KEY}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
