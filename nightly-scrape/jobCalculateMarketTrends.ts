import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2SinglesPriceHistoryPrefix } from "./r2BucketLayout";
import { buildS3Client, getR2Bucket } from "./r2Pricing";
import { buildOnePieceS3Client, getOnePieceR2Bucket } from "./onepieceR2";
import { loadOnePieceSetsFromR2 } from "./onepiecePricing";
import { sortedGradeKeys, sortedVariantKeys } from "./r2PriceTrends";
import type { PriceHistoryPoint, SetJsonEntry, SetPriceHistoryMap } from "./staticDataTypes";

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

async function calculateBrandTrend(
  s3: S3Client,
  bucket: string,
  historyPrefix: string,
  setCodes: string[]
): Promise<BrandTrend> {
  const today = getOffsetDateKey(0);
  const d1 = getOffsetDateKey(1);
  const d7 = getOffsetDateKey(7);
  const d31 = getOffsetDateKey(31);

  let sumT = 0;
  let sumT1 = 0;
  let sumT7 = 0;
  let sumT31 = 0;

  for (const code of setCodes) {
    const historyMap = await getJsonFromS3<SetPriceHistoryMap>(s3, bucket, `${historyPrefix}/${code}.json`);
    if (!historyMap) continue;

    for (const cardHistory of Object.values(historyMap)) {
      // One Piece format: default.raw.daily
      // Note: One Piece priceKeys already include the variant (e.g. OP01-001::parallel)
      if (cardHistory.default?.raw?.daily?.length) {
        processPoints(cardHistory.default.raw.daily);
      } else {
        // Pokemon format: variant.grade.daily
        // Requirement: Use RAW prices only, skip graded (psa10, ace10, etc.)
        for (const variant of Object.keys(cardHistory)) {
          const variantHistory = cardHistory[variant];
          if (!variantHistory || typeof variantHistory !== "object") continue;

          // Only use 'raw' grade as per user request
          const rawWindow = (variantHistory as any).raw;
          if (rawWindow?.daily?.length) {
            processPoints(rawWindow.daily);
          }
        }
      }

      function processPoints(dailyPoints: PriceHistoryPoint[]) {
        const sortedPoints = [...dailyPoints].sort((a, b) => a[0].localeCompare(b[0]));

        const getPriceOnOrBefore = (targetDate: string): number | null => {
          let lastPrice: number | null = null;
          for (const [date, price] of sortedPoints) {
            if (date > targetDate) break;
            lastPrice = price;
          }
          return lastPrice;
        };

        const p31 = getPriceOnOrBefore(d31);
        if (typeof p31 === 'number' && p31 > 0) {
          const pt = getPriceOnOrBefore(today);
          const p1 = getPriceOnOrBefore(d1);
          const p7 = getPriceOnOrBefore(d7);

          const isOutlier = (p: number | null) => {
            if (p === null) return true;
            // Spikes are less common in 'raw' prices but we'll keep a filter for sanity.
            // Using a slightly more generous 5x instead of 10x for raw.
            if (p > p31 * 5) return true;
            if (p < p31 * 0.1) return true;
            return false;
          };

          const safePt = isOutlier(pt) ? p31 : (pt ?? p31);
          const safeP1 = isOutlier(p1) ? p31 : (p1 ?? p31);
          const safeP7 = isOutlier(p7) ? p31 : (p7 ?? p31);

          sumT31 += p31;
          sumT7 += safeP7;
          sumT1 += safeP1;
          sumT += safePt;
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
  const pokemonSets = await getJsonFromS3<SetJsonEntry[]>(pokemonS3, pokemonBucket, "data/sets.json");
  const pokemonCodes = (pokemonSets ?? []).map((s) => s.setKey).filter(Boolean);

  console.log(`  Processing ${pokemonCodes.length} Pokemon sets…`);
  const pokemonTrend = await calculateBrandTrend(
    pokemonS3,
    pokemonBucket,
    r2SinglesPriceHistoryPrefix,
    pokemonCodes
  );

  const opS3 = buildOnePieceS3Client();
  const opBucket = getOnePieceR2Bucket();
  const opSets = await loadOnePieceSetsFromR2();
  const opCodes = opSets.map((s) => s.setCode).filter(Boolean);

  console.log(`  Processing ${opCodes.length} One Piece sets…`);
  const opTrend = await calculateBrandTrend(
    opS3,
    opBucket,
    "onepiece/pricing/history",
    opCodes
  );

  const result: MarketTrendResult = {
    pokemon: pokemonTrend,
    onepiece: opTrend,
    updatedAt: new Date().toISOString(),
  };

  await pokemonS3.send(
    new PutObjectCommand({
      Bucket: pokemonBucket,
      Key: "pricing/market-trend.json",
      Body: JSON.stringify(result, null, 2),
      ContentType: "application/json",
    })
  );

  console.log("  Market trends saved to R2 pricing/market-trend.json");
  console.log("Done.");
}
