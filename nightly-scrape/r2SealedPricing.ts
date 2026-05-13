import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import {
  r2SealedPriceTrendsKey,
  r2SealedDailyKey,
  r2SealedWeeklyKey,
  r2SealedMonthlyKey,
} from "./r2BucketLayout";
import type {
  PriceHistoryPoint,
  PriceTrendDirection,
  SealedProductPriceTrendMap,
  SealedProductPriceTrendSummary,
} from "./staticDataTypes";

export type {
  PriceHistoryPoint,
  SealedProductPriceTrendMap,
  SealedProductPriceTrendSummary,
};

const FLAT_THRESHOLD_PCT = 1;
const SEALED_PRICE_TRENDS_FILE = r2SealedPriceTrendsKey;

function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

function getPriceTrendBaseUrl(): string {
  const base =
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
    "";
  return base.replace(/\/+$/, "");
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

function computeChange(prev: number | undefined, curr: number): number | null {
  if (typeof prev !== "number" || !Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function directionForChange(changePct: number | null): PriceTrendDirection {
  if (changePct === null || !Number.isFinite(changePct) || Math.abs(changePct) < FLAT_THRESHOLD_PCT) {
    return "flat";
  }
  return changePct > 0 ? "up" : "down";
}

// ─── Snapshot file helpers ────────────────────────────────────────────────────

/** productId → market_value for a single period */
type SealedPricingSnapshot = Record<string, number>;

async function getSealedSnapshot(s3: S3Client, key: string): Promise<SealedPricingSnapshot> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
    const raw = await res.Body?.transformToString();
    if (!raw?.trim()) return {};
    return JSON.parse(raw) as SealedPricingSnapshot;
  } catch (e: unknown) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const name = (e as { name?: string }).name;
    if (status === 404 || name === "NoSuchKey") return {};
    throw e;
  }
}

async function putSealedSnapshot(s3: S3Client, key: string, data: SealedPricingSnapshot): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    }),
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSealedPriceTrends(): Promise<SealedProductPriceTrendMap | null> {
  const base = getPriceTrendBaseUrl();
  if (!base) return null;

  const url = `${base}/${SEALED_PRICE_TRENDS_FILE}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: process.env.NODE_ENV === "development" ? 0 : 86400 },
    } as RequestInit);
    if (!res.ok) return null;
    return (await res.json()) as SealedProductPriceTrendMap;
  } catch {
    return null;
  }
}

export async function updateSealedPriceHistory(
  s3: S3Client,
  prices: Record<string, { id: number; market_value: number | null }>,
): Promise<void> {
  const dailyKey = todayKey();
  const weekKey = currentWeekKey();
  const monthKey = currentMonthKey();

  const r2Daily = r2SealedDailyKey(dailyKey);
  const r2Weekly = r2SealedWeeklyKey(weekKey);
  const r2Monthly = r2SealedMonthlyKey(monthKey);

  const [dailySnapshot, weeklySnapshot, monthlySnapshot] = await Promise.all([
    getSealedSnapshot(s3, r2Daily),
    getSealedSnapshot(s3, r2Weekly),
    getSealedSnapshot(s3, r2Monthly),
  ]);

  const weeklyTotals: Record<string, { total: number; count: number }> = {};
  const monthlyTotals: Record<string, { total: number; count: number }> = {};

  for (const [id, price] of Object.entries(weeklySnapshot)) {
    weeklyTotals[id] = { total: price, count: 1 };
  }
  for (const [id, price] of Object.entries(monthlySnapshot)) {
    monthlyTotals[id] = { total: price, count: 1 };
  }

  for (const priceEntry of Object.values(prices)) {
    if (!priceEntry || typeof priceEntry.id !== "number") continue;
    if (typeof priceEntry.market_value !== "number" || !Number.isFinite(priceEntry.market_value)) continue;

    const productId = String(priceEntry.id);
    const usdValue = priceEntry.market_value;

    dailySnapshot[productId] = usdValue;

    const wt = weeklyTotals[productId];
    if (wt) { wt.total += usdValue; wt.count += 1; }
    else { weeklyTotals[productId] = { total: usdValue, count: 1 }; }

    const mt = monthlyTotals[productId];
    if (mt) { mt.total += usdValue; mt.count += 1; }
    else { monthlyTotals[productId] = { total: usdValue, count: 1 }; }
  }

  for (const [id, { total, count }] of Object.entries(weeklyTotals)) {
    weeklySnapshot[id] = total / count;
  }
  for (const [id, { total, count }] of Object.entries(monthlyTotals)) {
    monthlySnapshot[id] = total / count;
  }

  await Promise.all([
    putSealedSnapshot(s3, r2Daily, dailySnapshot),
    putSealedSnapshot(s3, r2Weekly, weeklySnapshot),
    putSealedSnapshot(s3, r2Monthly, monthlySnapshot),
  ]);
}

export async function uploadSealedPriceTrends(
  s3: S3Client,
  dailySnapshot: SealedPricingSnapshot,
  weeklySnapshot: SealedPricingSnapshot,
  monthlySnapshot: SealedPricingSnapshot,
  prevDailySnapshot: SealedPricingSnapshot,
  prevWeeklySnapshot: SealedPricingSnapshot,
  prevMonthlySnapshot: SealedPricingSnapshot,
): Promise<SealedProductPriceTrendMap> {
  const trendMap: SealedProductPriceTrendMap = {};

  for (const [productId, current] of Object.entries(dailySnapshot)) {
    if (!Number.isFinite(current)) continue;

    const dailyChangePct = computeChange(prevDailySnapshot[productId], current);
    const weeklyChangePct = computeChange(prevWeeklySnapshot[productId], weeklySnapshot[productId] ?? current);
    const monthlyChangePct = computeChange(prevMonthlySnapshot[productId], monthlySnapshot[productId] ?? current);

    const summary: SealedProductPriceTrendSummary = {
      current,
      daily: { changePct: dailyChangePct, direction: directionForChange(dailyChangePct) },
      weekly: { changePct: weeklyChangePct, direction: directionForChange(weeklyChangePct) },
      monthly: { changePct: monthlyChangePct, direction: directionForChange(monthlyChangePct) },
    };
    trendMap[productId] = summary;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: SEALED_PRICE_TRENDS_FILE,
      Body: JSON.stringify(trendMap),
      ContentType: "application/json",
    }),
  );

  return trendMap;
}
