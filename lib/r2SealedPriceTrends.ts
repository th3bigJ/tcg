import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import {
  R2_SEALED_POKEDATA_DEFAULT_SLUG,
  r2SealedPokedataPriceTrendsKey,
} from "@/lib/r2BucketLayout";
import type {
  PriceHistoryPoint,
  PriceTrendDirection,
  SealedProductPriceHistory,
  SealedProductPriceHistoryMap,
  SealedProductPriceTrendMap,
  SealedProductPriceTrendSummary,
} from "@/lib/staticDataTypes";

export type { SealedProductPriceTrendMap, SealedProductPriceTrendSummary };

const FLAT_THRESHOLD_PCT = 1;
const SEALED_PRICE_TRENDS_FILE = r2SealedPokedataPriceTrendsKey(R2_SEALED_POKEDATA_DEFAULT_SLUG);

function getPriceTrendBaseUrl(): string {
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

function computeChange(points: PriceHistoryPoint[]): number | null {
  if (points.length < 2) return null;
  const previous = points[points.length - 2]?.[1];
  const current = points[points.length - 1]?.[1];
  if (
    typeof previous !== "number" ||
    typeof current !== "number" ||
    !Number.isFinite(previous) ||
    !Number.isFinite(current) ||
    previous === 0
  ) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function directionForChange(changePct: number | null): PriceTrendDirection {
  if (changePct === null || !Number.isFinite(changePct) || Math.abs(changePct) < FLAT_THRESHOLD_PCT) {
    return "flat";
  }
  return changePct > 0 ? "up" : "down";
}

function buildWindowSummary(points: PriceHistoryPoint[]) {
  const changePct = computeChange(points);
  return {
    changePct,
    direction: directionForChange(changePct),
  };
}

export function buildTrendSummaryForSealedProduct(
  history: SealedProductPriceHistory,
): SealedProductPriceTrendSummary | null {
  const current = history?.daily?.[history.daily.length - 1]?.[1];
  if (typeof current !== "number" || !Number.isFinite(current)) return null;
  return {
    current,
    daily: buildWindowSummary(history.daily),
    weekly: buildWindowSummary(history.weekly),
    monthly: buildWindowSummary(history.monthly),
  };
}

export function buildSealedTrendMapFromHistoryMap(
  historyMap: SealedProductPriceHistoryMap,
): SealedProductPriceTrendMap {
  const out: SealedProductPriceTrendMap = {};
  for (const [productId, history] of Object.entries(historyMap)) {
    const summary = buildTrendSummaryForSealedProduct(history);
    if (summary) out[productId] = summary;
  }
  return out;
}

export async function getSealedPriceTrends(): Promise<SealedProductPriceTrendMap | null> {
  const base = getPriceTrendBaseUrl();
  if (!base) return null;

  const url = `${base}/${SEALED_PRICE_TRENDS_FILE}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: process.env.NODE_ENV === "development" ? 0 : 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as SealedProductPriceTrendMap;
  } catch {
    return null;
  }
}

export function getSealedPriceTrendForProduct(
  trendMap: SealedProductPriceTrendMap,
  productId: number | string,
): SealedProductPriceTrendSummary | null {
  const key = String(productId).trim();
  if (!key) return null;
  return trendMap[key] ?? null;
}

export async function uploadSealedPriceTrends(
  s3: S3Client,
  historyMap: SealedProductPriceHistoryMap,
): Promise<SealedProductPriceTrendMap> {
  const trendMap = buildSealedTrendMapFromHistoryMap(historyMap);
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
