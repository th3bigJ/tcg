import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { r2SinglesPriceTrendsPrefix } from "@/lib/r2BucketLayout";
import { PRICING_VARIANT_DISPLAY_ORDER } from "@/lib/pricingVariantRegistry";
import { buildPricingLookupIds } from "@/lib/r2Pricing";
import type {
  CardPriceHistory,
  CardPriceTrendSummary,
  GradeTrendSummary,
  PriceHistoryPoint,
  PriceTrendDirection,
  SetPriceHistoryMap,
  SetPriceTrendMap,
} from "@/lib/staticDataTypes";

export type { CardPriceTrendSummary, SetPriceTrendMap };

const FLAT_THRESHOLD_PCT = 1;
const PRIMARY_VARIANT_ORDER: string[] = [...PRICING_VARIANT_DISPLAY_ORDER];
const PRIMARY_GRADE_ORDER = ["raw", "psa10", "ace10"];

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

function sortedVariantKeys(cardHistory: CardPriceHistory): string[] {
  const keys = Object.keys(cardHistory);
  return keys.sort((left, right) => {
    const leftRank = PRIMARY_VARIANT_ORDER.indexOf(left);
    const rightRank = PRIMARY_VARIANT_ORDER.indexOf(right);
    const normalizedLeft = leftRank >= 0 ? leftRank : PRIMARY_VARIANT_ORDER.length;
    const normalizedRight = rightRank >= 0 ? rightRank : PRIMARY_VARIANT_ORDER.length;
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
    return left.localeCompare(right);
  });
}

function sortedGradeKeys(variantHistory: Record<string, { daily: PriceHistoryPoint[] }>): string[] {
  const keys = Object.keys(variantHistory);
  return keys.sort((left, right) => {
    const leftRank = PRIMARY_GRADE_ORDER.indexOf(left);
    const rightRank = PRIMARY_GRADE_ORDER.indexOf(right);
    const normalizedLeft = leftRank >= 0 ? leftRank : PRIMARY_GRADE_ORDER.length;
    const normalizedRight = rightRank >= 0 ? rightRank : PRIMARY_GRADE_ORDER.length;
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
    return left.localeCompare(right);
  });
}

function buildAllVariantsTrends(cardHistory: CardPriceHistory): Record<string, Record<string, GradeTrendSummary>> {
  const out: Record<string, Record<string, GradeTrendSummary>> = {};
  for (const variant of sortedVariantKeys(cardHistory)) {
    const variantHistory = cardHistory[variant];
    if (!variantHistory || typeof variantHistory !== "object") continue;
    for (const grade of sortedGradeKeys(variantHistory as Record<string, { daily: PriceHistoryPoint[] }>)) {
      const window = variantHistory[grade];
      const current = window?.daily?.[window.daily.length - 1]?.[1];
      if (typeof current !== "number" || !Number.isFinite(current)) continue;
      out[variant] ??= {};
      out[variant][grade] = {
        current,
        daily: buildWindowSummary(window.daily),
        weekly: buildWindowSummary(window.weekly),
        monthly: buildWindowSummary(window.monthly),
      };
    }
  }
  return out;
}

export function buildTrendSummaryForCard(cardHistory: CardPriceHistory): CardPriceTrendSummary | null {
  const allVariants = buildAllVariantsTrends(cardHistory);

  for (const variant of sortedVariantKeys(cardHistory)) {
    const variantHistory = cardHistory[variant];
    if (!variantHistory || typeof variantHistory !== "object") continue;

    for (const grade of sortedGradeKeys(variantHistory as Record<string, { daily: PriceHistoryPoint[] }>)) {
      const window = variantHistory[grade];
      const current = window?.daily?.[window.daily.length - 1]?.[1];
      if (typeof current !== "number" || !Number.isFinite(current)) continue;

      return {
        variant,
        grade,
        current,
        daily: buildWindowSummary(window.daily),
        weekly: buildWindowSummary(window.weekly),
        monthly: buildWindowSummary(window.monthly),
        allVariants,
      };
    }
  }

  return null;
}

export function buildTrendMapFromHistoryMap(historyMap: SetPriceHistoryMap): SetPriceTrendMap {
  const out: SetPriceTrendMap = {};
  for (const [externalId, cardHistory] of Object.entries(historyMap)) {
    const summary = buildTrendSummaryForCard(cardHistory);
    if (summary) out[externalId] = summary;
  }
  return out;
}

export async function getPriceTrendsForSet(setCode: string): Promise<SetPriceTrendMap | null> {
  const base = getPriceTrendBaseUrl();
  if (!base) return null;

  const url = `${base}/${r2SinglesPriceTrendsPrefix}/${setCode}.json`;
  try {
    const res = await fetch(url, {
      next: { revalidate: process.env.NODE_ENV === "development" ? 0 : 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as SetPriceTrendMap;
  } catch {
    return null;
  }
}

export function getPriceTrendForCard(
  trendMap: SetPriceTrendMap,
  externalId: string,
  fallbackIds?: string[],
): CardPriceTrendSummary | null {
  for (const id of buildPricingLookupIds(externalId)) {
    const match = trendMap[id];
    if (match) return match;
  }

  if (fallbackIds) {
    for (const fallbackId of fallbackIds) {
      for (const id of buildPricingLookupIds(fallbackId)) {
        const match = trendMap[id];
        if (match) return match;
      }
    }
  }

  return null;
}

export async function uploadPriceTrends(
  s3: S3Client,
  setCode: string,
  historyMap: SetPriceHistoryMap,
): Promise<SetPriceTrendMap> {
  const trendMap = buildTrendMapFromHistoryMap(historyMap);
  await s3.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: `${r2SinglesPriceTrendsPrefix}/${setCode}.json`,
      Body: JSON.stringify(trendMap),
      ContentType: "application/json",
    }),
  );
  return trendMap;
}
