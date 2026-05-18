import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import {
  r2NewPricingDailyKey,
  r2NewPricingWeeklyKey,
  r2NewPricingMonthlyKey,
  r2SinglesPriceTrendsPrefix,
} from "./r2BucketLayout.js";
import { buildPricingLookupIds } from "./r2Pricing.js";
import type {
  CardPriceHistory,
  PriceHistoryPoint,
  PriceHistoryWindow,
  ScrydexCardPricing,
  SetPriceHistoryMap,
  SetPricingMap,
} from "./staticDataTypes.js";

export type { CardPriceHistory, PriceHistoryPoint, PriceHistoryWindow, SetPriceHistoryMap };

const DAILY_HISTORY_LIMIT = 31;
const WEEKLY_HISTORY_LIMIT = 52;
const MONTHLY_HISTORY_LIMIT = 60;

/**
 * Shape of a new_pricing bucket file.
 * cardId → variant → grade → price (single price for that bucket period)
 */
type PricingBucketFile = Record<string, Record<string, Record<string, number>>>;

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

export function prevDayKey(date = new Date()): string {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - 1);
  return todayKey(d);
}

export function prevMonthKey(date = new Date()): string {
  const d = new Date(date.getTime());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return currentMonthKey(d);
}

export function prevWeekKey(date = new Date()): string {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - 7);
  return currentWeekKey(d);
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
    daily: Array.isArray(window?.daily) ? window.daily.filter(isPriceHistoryPoint).slice(-DAILY_HISTORY_LIMIT) : [],
    weekly: Array.isArray(window?.weekly) ? window.weekly.filter(isPriceHistoryPoint).slice(-WEEKLY_HISTORY_LIMIT) : [],
    monthly: Array.isArray(window?.monthly) ? window.monthly.filter(isPriceHistoryPoint).slice(-MONTHLY_HISTORY_LIMIT) : [],
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

  const byWeek = new Map<string, { total: number; count: number }>();
  const byMonth = new Map<string, { total: number; count: number }>();
  for (const [dateKey, price] of allDaily) {
    const wk = weekKeyFromDateKey(dateKey);
    const mk = monthKeyFromDateKey(dateKey);
    const w = byWeek.get(wk) ?? { total: 0, count: 0 };
    w.total += price; w.count += 1;
    byWeek.set(wk, w);
    const m = byMonth.get(mk) ?? { total: 0, count: 0 };
    m.total += price; m.count += 1;
    byMonth.set(mk, m);
  }

  const weekly: PriceHistoryPoint[] = [...byWeek.entries()]
    .map(([k, v]) => [k, v.total / v.count] as PriceHistoryPoint)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-WEEKLY_HISTORY_LIMIT);

  const monthly: PriceHistoryPoint[] = [...byMonth.entries()]
    .map(([k, v]) => [k, v.total / v.count] as PriceHistoryPoint)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-MONTHLY_HISTORY_LIMIT);

  const existing = ensureWindow(existingWindow);
  return {
    daily,
    weekly: weekly.length > 0 ? weekly : existing.weekly.slice(-WEEKLY_HISTORY_LIMIT),
    monthly: monthly.length > 0 ? monthly : existing.monthly.slice(-MONTHLY_HISTORY_LIMIT),
  };
}

export function mergeSetPriceHistoryMaps(existing: SetPriceHistoryMap, incoming: SetPriceHistoryMap): SetPriceHistoryMap {
  const out: SetPriceHistoryMap = {};
  for (const [id, cardHist] of Object.entries(existing)) {
    if (!cardHist) continue;
    out[id] = {};
    for (const [vKey, vObj] of Object.entries(cardHist as CardPriceHistory)) {
      out[id][vKey] = {};
      for (const [gKey, win] of Object.entries(vObj as Record<string, PriceHistoryWindow>)) {
        out[id][vKey][gKey] = ensureWindow(win as Partial<PriceHistoryWindow>);
      }
    }
  }
  for (const [id, cardHist] of Object.entries(incoming)) {
    if (!cardHist) continue;
    out[id] ??= {};
    const base = out[id];
    for (const [vKey, vObj] of Object.entries(cardHist as CardPriceHistory)) {
      base[vKey] ??= {};
      for (const [gKey, win] of Object.entries(vObj as Record<string, PriceHistoryWindow>)) {
        base[vKey][gKey] = ensureWindow(win as Partial<PriceHistoryWindow>);
      }
    }
  }
  return out;
}

function extractVariantGradePrices(
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

// ─── R2 bucket file helpers ───────────────────────────────────────────────────

async function sendWithRetry(s3: S3Client, command: any, attempts = 5): Promise<any> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await s3.send(command);
    } catch (e: unknown) {
      lastError = e;
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const name = (e as { name?: string }).name;
      if (status === 404 || name === "NoSuchKey") {
        throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

async function getPriceTrendsFile(s3: S3Client, key: string): Promise<any> {
  try {
    const res = await sendWithRetry(s3, new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
    const raw = await res.Body?.transformToString();
    if (!raw?.trim()) return null;
    return JSON.parse(raw);
  } catch (e: unknown) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const name = (e as { name?: string }).name;
    if (status === 404 || name === "NoSuchKey") return null;
    throw e;
  }
}

const bucketFileCache = new Map<string, Promise<PricingBucketFile>>();

async function getBucketFile(s3: S3Client, key: string): Promise<PricingBucketFile> {
  if (!bucketFileCache.has(key)) {
    const promise = (async () => {
      try {
        const res = await sendWithRetry(s3, new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
        const raw = await res.Body?.transformToString();
        if (!raw?.trim()) return {};
        return JSON.parse(raw) as PricingBucketFile;
      } catch (e: unknown) {
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        const name = (e as { name?: string }).name;
        if (status === 404 || name === "NoSuchKey") return {};
        throw e;
      }
    })();
    bucketFileCache.set(key, promise);
  }
  return bucketFileCache.get(key)!;
}

async function putBucketFile(s3: S3Client, key: string, data: PricingBucketFile): Promise<void> {
  await sendWithRetry(
    s3,
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    }),
  );
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

// ─── Main update function ─────────────────────────────────────────────────────

/**
 * For each card in `currentPricingMap`, writes today's price into the three
 * consolidated bucket files (daily/{date}.json, weekly/…, monthly/…).
 *
 * Weekly and monthly values are the running average of all daily scrapes
 * seen for that card within the current period.
 *
 * Returns a `SetPriceHistoryMap` reconstructed from the bucket files so that
 * the trends job has the same interface as before.
 */
export async function updatePriceHistory(
  s3: S3Client,
  setCode: string,
  currentPricingMap: SetPricingMap,
): Promise<{ historyMap: SetPriceHistoryMap; dailyFile: PricingBucketFile }> {
  const dailyKey = todayKey();
  const weekKey = currentWeekKey();
  const monthKey = currentMonthKey();

  const prevDKey = prevDayKey();
  const prevWKey = prevWeekKey();
  const prevMKey = prevMonthKey();

  const r2DailyKey = r2NewPricingDailyKey(dailyKey);
  const r2WeeklyKey = r2NewPricingWeeklyKey(weekKey);
  const r2MonthlyKey = r2NewPricingMonthlyKey(monthKey);
  const trendsKey = `${r2SinglesPriceTrendsPrefix}/${setCode}.json`;

  // Load the current and previous consolidated bucket files in parallel, as well as the price trends file.
  const [dailyFile, weeklyFile, monthlyFile, prevDailyFile, prevWeeklyFile, prevMonthlyFile, priceTrendsFile] = await Promise.all([
    getBucketFile(s3, r2DailyKey),
    getBucketFile(s3, r2WeeklyKey),
    getBucketFile(s3, r2MonthlyKey),
    getBucketFile(s3, r2NewPricingDailyKey(prevDKey)),
    getBucketFile(s3, r2NewPricingWeeklyKey(prevWKey)),
    getBucketFile(s3, r2NewPricingMonthlyKey(prevMKey)),
    getPriceTrendsFile(s3, trendsKey),
  ]);

  // Running totals for weekly/monthly averages — seeded from existing bucket values.
  const weeklyTotals: Record<string, Record<string, Record<string, { total: number; count: number }>>> = {};
  const monthlyTotals: Record<string, Record<string, Record<string, { total: number; count: number }>>> = {};

  for (const [cardId, variants] of Object.entries(weeklyFile)) {
    weeklyTotals[cardId] ??= {};
    for (const [variant, grades] of Object.entries(variants)) {
      weeklyTotals[cardId][variant] ??= {};
      for (const [grade, price] of Object.entries(grades)) {
        weeklyTotals[cardId][variant][grade] = { total: price, count: 1 };
      }
    }
  }
  for (const [cardId, variants] of Object.entries(monthlyFile)) {
    monthlyTotals[cardId] ??= {};
    for (const [variant, grades] of Object.entries(variants)) {
      monthlyTotals[cardId][variant] ??= {};
      for (const [grade, price] of Object.entries(grades)) {
        monthlyTotals[cardId][variant][grade] = { total: price, count: 1 };
      }
    }
  }

  for (const [externalId, entry] of Object.entries(currentPricingMap) as [string, { scrydex: ScrydexCardPricing | null }][]) {
    const extracted = extractVariantGradePrices(entry.scrydex);
    const prevExtracted = prevDailyFile[externalId] || {};
    const trendExtracted = priceTrendsFile?.[externalId]?.allVariants || {};

    // Get all variant slugs from current scrape, previous day's file, and existing trends file
    const allVariants = new Set([
      ...Object.keys(extracted),
      ...Object.keys(prevExtracted),
      ...Object.keys(trendExtracted),
    ]);

    for (const variantSlug of allVariants) {
      const grades = extracted[variantSlug] || {};
      const prevGrades = prevExtracted[variantSlug] || {};
      const trendGrades = trendExtracted[variantSlug] || {};
      const allGrades = new Set([
        ...Object.keys(grades),
        ...Object.keys(prevGrades),
        ...Object.keys(trendGrades),
      ]);

      for (const gradeKey of allGrades) {
        const scrapedPrice = grades[gradeKey];
        const prevPrice = prevGrades[gradeKey];

        // A price is valid if it is a number, finite, and > 0
        const isScrapedValid = typeof scrapedPrice === "number" && Number.isFinite(scrapedPrice) && scrapedPrice > 0;
        const isPrevValid = typeof prevPrice === "number" && Number.isFinite(prevPrice) && prevPrice > 0;

        let finalPrice = 0;
        if (isScrapedValid) {
          finalPrice = scrapedPrice;
        } else if (isPrevValid) {
          finalPrice = prevPrice;
          console.log(`  [fallback] Using last available price for ${externalId} (${variantSlug} - ${gradeKey}): $${prevPrice}`);
        } else {
          const trendPrice = trendGrades[gradeKey]?.current;
          const isTrendValid = typeof trendPrice === "number" && Number.isFinite(trendPrice) && trendPrice > 0;
          if (isTrendValid) {
            finalPrice = trendPrice;
            console.log(`  [fallback-trends] Using last available price from trends for ${externalId} (${variantSlug} - ${gradeKey}): $${trendPrice}`);
          }
        }

        if (finalPrice > 0) {
          dailyFile[externalId] ??= {};
          dailyFile[externalId][variantSlug] ??= {};
          dailyFile[externalId][variantSlug][gradeKey] = finalPrice;

          weeklyTotals[externalId] ??= {};
          weeklyTotals[externalId][variantSlug] ??= {};
          const wt = weeklyTotals[externalId][variantSlug][gradeKey];
          if (wt) {
            wt.total += finalPrice;
            wt.count += 1;
          } else {
            weeklyTotals[externalId][variantSlug][gradeKey] = { total: finalPrice, count: 1 };
          }

          monthlyTotals[externalId] ??= {};
          monthlyTotals[externalId][variantSlug] ??= {};
          const mt = monthlyTotals[externalId][variantSlug][gradeKey];
          if (mt) {
            mt.total += finalPrice;
            mt.count += 1;
          } else {
            monthlyTotals[externalId][variantSlug][gradeKey] = { total: finalPrice, count: 1 };
          }
        }
      }
    }
  }

  for (const [cardId, variants] of Object.entries(weeklyTotals)) {
    weeklyFile[cardId] ??= {};
    for (const [variant, grades] of Object.entries(variants)) {
      weeklyFile[cardId][variant] ??= {};
      for (const [grade, { total, count }] of Object.entries(grades)) {
        weeklyFile[cardId][variant][grade] = total / count;
      }
    }
  }
  for (const [cardId, variants] of Object.entries(monthlyTotals)) {
    monthlyFile[cardId] ??= {};
    for (const [variant, grades] of Object.entries(variants)) {
      monthlyFile[cardId][variant] ??= {};
      for (const [grade, { total, count }] of Object.entries(grades)) {
        monthlyFile[cardId][variant][grade] = total / count;
      }
    }
  }

  // Cleanup zero-value "default" variants in daily/weekly/monthly files if other variants have non-zero prices
  const filesToCleanup = [dailyFile, weeklyFile, monthlyFile];
  for (const file of filesToCleanup) {
    for (const [cardId, variants] of Object.entries(file)) {
      const hasRealPrice = Object.entries(variants).some(([vName, grades]) => {
        if (vName === "default") return false;
        return Object.values(grades).some((p) => typeof p === "number" && p > 0);
      });
      if (hasRealPrice && variants["default"]) {
        const defaultGrades = variants["default"];
        const isDefaultAllZero = Object.values(defaultGrades).every((p) => p === 0);
        if (isDefaultAllZero) {
          delete variants["default"];
          console.log(`  [cleanup] Removed zero-value default variant for ${cardId} since other variants have prices`);
        }
      }
    }
  }

  await Promise.all([
    putBucketFile(s3, r2DailyKey, dailyFile),
    putBucketFile(s3, r2WeeklyKey, weeklyFile),
    putBucketFile(s3, r2MonthlyKey, monthlyFile),
  ]);

  const historyMap: SetPriceHistoryMap = {};
  for (const externalId of Object.keys(currentPricingMap)) {
    const dVariants = dailyFile[externalId];
    if (!dVariants) continue;

    const cardHistory: CardPriceHistory = {};
    for (const [variant, grades] of Object.entries(dVariants)) {
      cardHistory[variant] ??= {};
      for (const grade of Object.keys(grades)) {
        const daily: PriceHistoryPoint[] = [];
        const prevDailyPrice = prevDailyFile[externalId]?.[variant]?.[grade];
        if (prevDailyPrice !== undefined) daily.push([prevDKey, prevDailyPrice]);
        daily.push([dailyKey, dVariants[variant][grade]]);

        const weekly: PriceHistoryPoint[] = [];
        const prevWeeklyPrice = prevWeeklyFile[externalId]?.[variant]?.[grade];
        if (prevWeeklyPrice !== undefined) weekly.push([prevWKey, prevWeeklyPrice]);
        const weeklyPrice = weeklyFile[externalId]?.[variant]?.[grade];
        if (weeklyPrice !== undefined) weekly.push([weekKey, weeklyPrice]);

        const monthly: PriceHistoryPoint[] = [];
        const prevMonthlyPrice = prevMonthlyFile[externalId]?.[variant]?.[grade];
        if (prevMonthlyPrice !== undefined) monthly.push([prevMKey, prevMonthlyPrice]);
        const monthlyPrice = monthlyFile[externalId]?.[variant]?.[grade];
        if (monthlyPrice !== undefined) monthly.push([monthKey, monthlyPrice]);

        cardHistory[variant][grade] = { daily, weekly, monthly };
      }
    }
    historyMap[externalId] = cardHistory;
  }

  return { historyMap, dailyFile };
}
