import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2NewPricingDailyKey, r2MarketTrendKey } from "./r2BucketLayout.js";
import { buildS3Client, getR2Bucket } from "./r2Pricing";
import { buildOnePieceS3Client, getOnePieceR2Bucket } from "./onepieceR2";
import { loadOnePieceSetsFromR2 } from "./onepiecePricing";
import type { PriceHistoryPoint, SetPriceHistoryMap } from "./staticDataTypes";

interface BrandTrend {
  sumToday: number;
  sum1DayAgo: number;
  sum7DaysAgo: number;
  sum31DaysAgo: number;
  change1Day: number | null;
  change7Days: number | null;
  change31Days: number | null;
}

interface MarketTrendResult {
  pokemon: BrandTrend;
  onepiece: BrandTrend;
  updatedAt: string;
}

function calculateChange(current: number, old: number): number | null {
  if (old === 0) return null;
  return ((current - old) / old) * 100;
}

function getOffsetDateKey(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getJsonFromS3<T>(s3: S3Client, bucket: string, key: string): Promise<T | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const raw = await res.Body?.transformToString();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Consolidated daily file shape: cardId → variant → grade → price */
type DailySetFile = Record<string, Record<string, Record<string, number>>>;

async function sumDailyRawPrices(
  s3: S3Client,
  bucket: string,
  dateKey: string,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  const key = r2NewPricingDailyKey(dateKey);
  const data = await getJsonFromS3<DailySetFile>(s3, bucket, key);
  if (!data) return totals;
  for (const [cardId, variants] of Object.entries(data)) {
    for (const [variant, grades] of Object.entries(variants)) {
      const price = grades["raw"];
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) continue;
      totals.set(`${cardId}::${variant}`, price);
    }
  }
  return totals;
}

async function calculatePokemonBrandTrend(s3: S3Client, bucket: string): Promise<BrandTrend> {
  const [mapT, mapT1, mapT7, mapT31] = await Promise.all(
    [0, 1, 7, 31].map((n) => sumDailyRawPrices(s3, bucket, getOffsetDateKey(n))),
  );

  const isOutlier = (p: number | null, p31: number) => p === null || p > p31 * 5;

  let sumT = 0, sumT1 = 0, sumT7 = 0, sumT31 = 0;

  for (const [key, p31] of mapT31) {
    if (p31 <= 0) continue;
    const pt = mapT.get(key) ?? null;
    const p1 = mapT1.get(key) ?? null;
    const p7 = mapT7.get(key) ?? null;

    sumT31 += p31;
    sumT   += isOutlier(pt,  p31) ? p31 : pt!;
    sumT1  += isOutlier(p1,  p31) ? p31 : p1!;
    sumT7  += isOutlier(p7,  p31) ? p31 : p7!;
  }

  return {
    sumToday: sumT,
    sum1DayAgo: sumT1,
    sum7DaysAgo: sumT7,
    sum31DaysAgo: sumT31,
    change1Day: calculateChange(sumT, sumT1),
    change7Days: calculateChange(sumT, sumT7),
    change31Days: calculateChange(sumT, sumT31),
  };
}

async function calculateOnePieceBrandTrend(
  s3: S3Client,
  bucket: string,
  setCodes: string[],
): Promise<BrandTrend> {
  const today = getOffsetDateKey(0);
  const d1 = getOffsetDateKey(1);
  const d7 = getOffsetDateKey(7);
  const d31 = getOffsetDateKey(31);

  let sumT = 0, sumT1 = 0, sumT7 = 0, sumT31 = 0;

  const getPriceOnOrBefore = (points: PriceHistoryPoint[], targetDate: string): number | null => {
    let last: number | null = null;
    for (const [date, price] of points) {
      if (date > targetDate) break;
      last = price;
    }
    return last;
  };

  for (const code of setCodes) {
    const historyMap = await getJsonFromS3<SetPriceHistoryMap>(s3, bucket, `onepiece/pricing/history/${code}.json`);
    if (!historyMap) continue;

    for (const cardHistory of Object.values(historyMap)) {
      for (const grades of Object.values(cardHistory)) {
        for (const window of Object.values(grades)) {
          const sortedPoints = [...window.daily].sort((a, b) => a[0].localeCompare(b[0]));

          const p31 = getPriceOnOrBefore(sortedPoints, d31);
          if (typeof p31 !== "number" || p31 <= 0) continue;

          const pt = getPriceOnOrBefore(sortedPoints, today);
          const p1 = getPriceOnOrBefore(sortedPoints, d1);
          const p7 = getPriceOnOrBefore(sortedPoints, d7);

          const isOutlier = (p: number | null) => p === null || p > p31 * 5;

          sumT31 += p31;
          sumT   += isOutlier(pt) ? p31 : pt!;
          sumT1  += isOutlier(p1) ? p31 : p1!;
          sumT7  += isOutlier(p7) ? p31 : p7!;
        }
      }
    }
  }

  return {
    sumToday: sumT,
    sum1DayAgo: sumT1,
    sum7DaysAgo: sumT7,
    sum31DaysAgo: sumT31,
    change1Day: calculateChange(sumT, sumT1),
    change7Days: calculateChange(sumT, sumT7),
    change31Days: calculateChange(sumT, sumT31),
  };
}

export async function runCalculateMarketTrends(): Promise<void> {
  console.log("=== Calculating Market Trends ===");

  const pokemonS3 = buildS3Client();
  const pokemonBucket = getR2Bucket();

  console.log("  Processing Pokemon (daily bucket files)…");
  const pokemonTrend = await calculatePokemonBrandTrend(pokemonS3, pokemonBucket);

  const opS3 = buildOnePieceS3Client();
  const opBucket = getOnePieceR2Bucket();
  const opSets = await loadOnePieceSetsFromR2();
  const opCodes = opSets.map((s: { setCode: string }) => s.setCode).filter(Boolean);

  console.log(`  Processing ${opCodes.length} One Piece sets…`);
  const opTrend = await calculateOnePieceBrandTrend(opS3, opBucket, opCodes);

  const result: MarketTrendResult = {
    pokemon: pokemonTrend,
    onepiece: opTrend,
    updatedAt: new Date().toISOString(),
  };

  await pokemonS3.send(
    new PutObjectCommand({
      Bucket: pokemonBucket,
      Key: r2MarketTrendKey,
      Body: JSON.stringify(result, null, 2),
      ContentType: "application/json",
    })
  );

  console.log(`  Market trends saved to R2 ${r2MarketTrendKey}`);
  console.log("Done.");
}
