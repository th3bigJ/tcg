import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { r2SinglesPriceHistoryPrefix } from "@/lib/r2BucketLayout";
import { buildPricingLookupIds } from "@/lib/r2Pricing";
import type {
  CardPriceHistory,
  PriceHistoryPoint,
  PriceHistoryWindow,
  ScrydexCardPricing,
  SetPriceHistoryMap,
  SetPricingMap,
} from "@/lib/staticDataTypes";

export type { CardPriceHistory, PriceHistoryPoint, PriceHistoryWindow, SetPriceHistoryMap };

const DAILY_HISTORY_LIMIT = 31;
const WEEKLY_HISTORY_LIMIT = 52;
const MONTHLY_HISTORY_LIMIT = 60;

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

function aggregateLatestByBucket(
  points: PriceHistoryPoint[],
  keyForPoint: (dateKey: string) => string,
  maxLen: number,
): PriceHistoryPoint[] {
  const sorted = [...points].sort((left, right) => left[0].localeCompare(right[0]));
  const byBucket = new Map<string, number>();
  for (const [dateKey, price] of sorted) {
    byBucket.set(keyForPoint(dateKey), price);
  }
  return [...byBucket.entries()].slice(-maxLen);
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

function ensureWindow(window?: Partial<PriceHistoryWindow>): PriceHistoryWindow {
  return {
    daily: Array.isArray(window?.daily) ? window.daily.filter(isPriceHistoryPoint) : [],
    weekly: Array.isArray(window?.weekly) ? window.weekly.filter(isPriceHistoryPoint) : [],
    monthly: Array.isArray(window?.monthly) ? window.monthly.filter(isPriceHistoryPoint) : [],
  };
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

export function extractVariantGradePrices(
  scrydexData: ScrydexCardPricing | null | undefined,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (!scrydexData || typeof scrydexData !== "object") return out;

  for (const [variantSlug, grades] of Object.entries(scrydexData)) {
    if (!grades || typeof grades !== "object") continue;
    for (const [gradeKey, price] of Object.entries(grades)) {
      if (typeof price !== "number" || !Number.isFinite(price)) continue;
      out[variantSlug] ??= {};
      out[variantSlug][gradeKey] = price;
    }
  }

  return out;
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

export async function getPriceHistoryForSet(setCode: string): Promise<SetPriceHistoryMap | null> {
  const base = getPriceHistoryBaseUrl();
  if (!base) return null;

  const url = `${base}/${r2SinglesPriceHistoryPrefix}/${setCode}.json`;
  try {
    const res = await fetch(url, {
      next: { revalidate: process.env.NODE_ENV === "development" ? 0 : 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as SetPriceHistoryMap;
  } catch {
    return null;
  }
}

export function getPriceHistoryForCard(
  historyMap: SetPriceHistoryMap,
  externalId: string,
  fallbackIds?: string[],
): CardPriceHistory | null {
  for (const id of buildPricingLookupIds(externalId)) {
    const match = historyMap[id];
    if (match) return match;
  }

  if (fallbackIds) {
    for (const fallbackId of fallbackIds) {
      for (const id of buildPricingLookupIds(fallbackId)) {
        const match = historyMap[id];
        if (match) return match;
      }
    }
  }

  return null;
}

export async function updatePriceHistory(
  s3: S3Client,
  setCode: string,
  currentPricingMap: SetPricingMap,
): Promise<SetPriceHistoryMap> {
  const historyMap = (await getPriceHistoryForSet(setCode)) ?? {};
  const dailyKey = todayKey();
  const weekKey = currentWeekKey();
  const monthKey = currentMonthKey();

  for (const [externalId, entry] of Object.entries(currentPricingMap)) {
    const extracted = extractVariantGradePrices(entry.scrydex);
    if (Object.keys(extracted).length === 0) continue;

    const cardHistory = historyMap[externalId] ?? {};
    for (const [variantSlug, grades] of Object.entries(extracted)) {
      cardHistory[variantSlug] ??= {};
      for (const [gradeKey, price] of Object.entries(grades)) {
        const current = ensureWindow(cardHistory[variantSlug][gradeKey]);
        const daily = upsertAndTrim(current.daily, dailyKey, price, DAILY_HISTORY_LIMIT);
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
        cardHistory[variantSlug][gradeKey] = { daily, weekly, monthly };
      }
    }
    historyMap[externalId] = cardHistory;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: `${r2SinglesPriceHistoryPrefix}/${setCode}.json`,
      Body: JSON.stringify(historyMap),
      ContentType: "application/json",
    }),
  );

  return historyMap;
}
