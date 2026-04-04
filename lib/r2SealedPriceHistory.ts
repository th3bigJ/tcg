import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  PriceHistoryPoint,
  PriceHistoryWindow,
  SealedProductPriceHistory,
  SealedProductPriceHistoryMap,
} from "@/lib/staticDataTypes";

export type {
  PriceHistoryPoint,
  PriceHistoryWindow,
  SealedProductPriceHistory,
  SealedProductPriceHistoryMap,
};

const DAILY_HISTORY_LIMIT = 31;
const WEEKLY_HISTORY_LIMIT = 52;
const MONTHLY_HISTORY_LIMIT = 60;
const SEALED_PRICE_HISTORY_FILE = "sealed-products/pokedata/pokedata-english-pokemon-price-history.json";
const LOCAL_SEALED_PRICE_HISTORY_FILE = path.join(
  process.cwd(),
  "data",
  "sealed-products",
  "pokedata-english-pokemon-price-history.json",
);

function getPriceHistoryBaseUrl(): string {
  const base =
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
    "";
  return base.replace(/\/+$/, "");
}

function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

function getUtcDateParts(date = new Date()): { year: number; month: number; day: number } {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function todayKey(date = new Date()): string {
  const { year, month, day } = getUtcDateParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function currentMonthKey(date = new Date()): string {
  const { year, month } = getUtcDateParts(date);
  return `${year}-${pad2(month)}`;
}

export function currentWeekKey(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${pad2(week)}`;
}

function weekKeyFromDateKey(dateKey: string): string {
  return currentWeekKey(new Date(`${dateKey}T00:00:00.000Z`));
}

function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function isPriceHistoryPoint(value: unknown): value is PriceHistoryPoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function ensureWindow(window?: Partial<PriceHistoryWindow>): PriceHistoryWindow {
  return {
    daily: Array.isArray(window?.daily) ? window.daily.filter(isPriceHistoryPoint) : [],
    weekly: Array.isArray(window?.weekly) ? window.weekly.filter(isPriceHistoryPoint) : [],
    monthly: Array.isArray(window?.monthly) ? window.monthly.filter(isPriceHistoryPoint) : [],
  };
}

export function upsertAndTrim(
  points: PriceHistoryPoint[],
  key: string,
  price: number,
  maxLen: number,
): PriceHistoryPoint[] {
  const next = points.filter(([existingKey]) => existingKey !== key);
  next.push([key, price]);
  next.sort((left, right) => left[0].localeCompare(right[0]));
  return next.slice(-maxLen);
}

function aggregateAverageByBucket(
  points: PriceHistoryPoint[],
  keyForPoint: (dateKey: string) => string,
  maxLen: number,
): PriceHistoryPoint[] {
  const sorted = [...points].sort((left, right) => left[0].localeCompare(right[0]));
  const byBucket = new Map<string, { total: number; count: number }>();
  for (const [dateKey, price] of sorted) {
    const bucketKey = keyForPoint(dateKey);
    const current = byBucket.get(bucketKey) ?? { total: 0, count: 0 };
    current.total += price;
    current.count += 1;
    byBucket.set(bucketKey, current);
  }
  return [...byBucket.entries()]
    .map(([bucketKey, value]) => [bucketKey, value.total / value.count] as PriceHistoryPoint)
    .slice(-maxLen);
}

function deriveWeeklyAndMonthlyFromDaily(daily: PriceHistoryPoint[]): Pick<PriceHistoryWindow, "weekly" | "monthly"> {
  return {
    weekly: aggregateAverageByBucket(daily, weekKeyFromDateKey, WEEKLY_HISTORY_LIMIT),
    monthly: aggregateAverageByBucket(daily, monthKeyFromDateKey, MONTHLY_HISTORY_LIMIT),
  };
}

export function mergeDailySeriesIntoWindow(
  existingWindow: Partial<PriceHistoryWindow> | undefined,
  dailyPoints: PriceHistoryPoint[],
): PriceHistoryWindow {
  const allDaily = [...dailyPoints]
    .filter(isPriceHistoryPoint)
    .sort((left, right) => left[0].localeCompare(right[0]));
  const daily = allDaily.slice(-DAILY_HISTORY_LIMIT);
  const derived = deriveWeeklyAndMonthlyFromDaily(allDaily);
  const existing = ensureWindow(existingWindow);

  return {
    daily,
    weekly: derived.weekly.length > 0 ? derived.weekly : existing.weekly.slice(-WEEKLY_HISTORY_LIMIT),
    monthly: derived.monthly.length > 0 ? derived.monthly : existing.monthly.slice(-MONTHLY_HISTORY_LIMIT),
  };
}

function upsertAverageForBucket(
  points: PriceHistoryPoint[],
  dailyPoints: PriceHistoryPoint[],
  bucketKey: string,
  keyForPoint: (dateKey: string) => string,
  maxLen: number,
): PriceHistoryPoint[] {
  const bucketPoints = dailyPoints.filter(([dateKey]) => keyForPoint(dateKey) === bucketKey);
  if (bucketPoints.length === 0) return points.slice(-maxLen);
  const average = bucketPoints.reduce((sum, [, price]) => sum + price, 0) / bucketPoints.length;
  return upsertAndTrim(points, bucketKey, average, maxLen);
}

type CacheEntry<T> = { value: T; expiresAt: number };
let _priceHistoryCache: CacheEntry<SealedProductPriceHistoryMap | null> | null = null;

export async function getSealedPriceHistory(): Promise<SealedProductPriceHistoryMap | null> {
  if (_priceHistoryCache && Date.now() < _priceHistoryCache.expiresAt) return _priceHistoryCache.value;

  const base = getPriceHistoryBaseUrl();
  if (base) {
    const url = `${base}/${SEALED_PRICE_HISTORY_FILE}`;
    const ttlMs = process.env.NODE_ENV === "development" ? 0 : 24 * 60 * 60 * 1000;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const value = (await res.json()) as SealedProductPriceHistoryMap;
        _priceHistoryCache = { value, expiresAt: Date.now() + ttlMs };
        return value;
      }
    } catch {}
  }

  if (process.env.NODE_ENV === "development") {
    try {
      const raw = await readFile(LOCAL_SEALED_PRICE_HISTORY_FILE, "utf8");
      return JSON.parse(raw) as SealedProductPriceHistoryMap;
    } catch {}
  }

  return null;
}

export function getSealedPriceHistoryForProduct(
  historyMap: SealedProductPriceHistoryMap,
  productId: number | string,
): SealedProductPriceHistory | null {
  const key = String(productId).trim();
  if (!key) return null;
  return historyMap[key] ?? null;
}

export async function updateSealedPriceHistory(
  s3: S3Client,
  prices: Record<string, { id: number; market_value: number | null }>,
  usdToGbpMultiplier: number,
): Promise<SealedProductPriceHistoryMap> {
  const historyMap = (await getSealedPriceHistory()) ?? {};
  const dailyKey = todayKey();
  const weekKey = currentWeekKey();
  const monthKey = currentMonthKey();

  for (const priceEntry of Object.values(prices)) {
    if (!priceEntry || typeof priceEntry.id !== "number") continue;
    if (typeof priceEntry.market_value !== "number" || !Number.isFinite(priceEntry.market_value)) continue;

    const productId = String(priceEntry.id);
    const current = ensureWindow(historyMap[productId]);
    const gbpValue = priceEntry.market_value * usdToGbpMultiplier;
    const daily = upsertAndTrim(current.daily, dailyKey, gbpValue, DAILY_HISTORY_LIMIT);
    const weekly = upsertAverageForBucket(
      current.weekly,
      daily,
      weekKey,
      weekKeyFromDateKey,
      WEEKLY_HISTORY_LIMIT,
    );
    const monthly = upsertAverageForBucket(
      current.monthly,
      daily,
      monthKey,
      monthKeyFromDateKey,
      MONTHLY_HISTORY_LIMIT,
    );
    historyMap[productId] = { daily, weekly, monthly };
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: SEALED_PRICE_HISTORY_FILE,
      Body: JSON.stringify(historyMap),
      ContentType: "application/json",
    }),
  );

  return historyMap;
}
