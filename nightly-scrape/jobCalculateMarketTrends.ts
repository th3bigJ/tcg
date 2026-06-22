import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2NewPricingDailyKey, r2MarketTrendKey, r2PokemonMarketMoversKey } from "./r2BucketLayout.js";
import { buildS3Client, getR2Bucket } from "./r2Pricing.js";
import type { PokemonMarketMovers } from "./jobScrapePricing.js";
import type { PriceHistoryPoint } from "./staticDataTypes.js";

interface MoverEntry {
  cardID: string;
  cardName: string;
  imageURL: string | null;
  percentChange: number;
}

interface BrandTrend {
  sumToday: number;
  sum1DayAgo: number;
  sum7DaysAgo: number;
  sum31DaysAgo: number;
  change1Day: number | null;
  change7Days: number | null;
  change31Days: number | null;
  biggestGainer7Days?: MoverEntry | null;
  biggestDecliner7Days?: MoverEntry | null;
}

interface MarketTrendResult {
  pokemon: BrandTrend;
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
  for (let i = 0; i < 5; i++) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const raw = await res.Body?.transformToString();
      return raw ? JSON.parse(raw) : null;
    } catch (e: unknown) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const name = (e as { name?: string }).name;
      if (status === 404 || name === "NoSuchKey") return null;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return null;
}

async function sendPutWithRetry(s3: S3Client, command: PutObjectCommand, attempts = 5): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await s3.send(command);
      return;
    } catch (e) {
      lastError = e;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastError;
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

  const isOutlier = (p: number, reference: number) => p > reference * 5 || p < reference / 5;

  let sumT = 0, sumT1 = 0, sumT7 = 0, sumT31 = 0;

  for (const [key, p31] of mapT31) {
    if (p31 <= 0) continue;
    
    const pt = mapT.get(key);
    const p1 = mapT1.get(key);
    const p7 = mapT7.get(key);

    // Exclude if price is missing on any day
    if (pt === undefined || p1 === undefined || p7 === undefined) continue;

    // Exclude if any price is an extreme outlier (upward or downward > 5x)
    if (isOutlier(pt, p31) || isOutlier(p1, p31) || isOutlier(p7, p31)) continue;

    sumT31 += p31;
    sumT   += pt;
    sumT1  += p1;
    sumT7  += p7;
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

  // Read pre-computed market movers written by the pricing scraper.
  const pokemonMovers = await getJsonFromS3<PokemonMarketMovers>(pokemonS3, pokemonBucket, r2PokemonMarketMoversKey);
  if (pokemonMovers?.topGainer) {
    pokemonTrend.biggestGainer7Days = {
      cardID: pokemonMovers.topGainer.cardID,
      cardName: pokemonMovers.topGainer.cardName,
      imageURL: pokemonMovers.topGainer.imageURL,
      percentChange: pokemonMovers.topGainer.percentChange,
    };
    console.log(`  Biggest Pokemon gainer: ${pokemonMovers.topGainer.cardName} (+${pokemonMovers.topGainer.percentChange.toFixed(1)}%)`);
  }
  if (pokemonMovers?.topDecliner) {
    pokemonTrend.biggestDecliner7Days = {
      cardID: pokemonMovers.topDecliner.cardID,
      cardName: pokemonMovers.topDecliner.cardName,
      imageURL: pokemonMovers.topDecliner.imageURL,
      percentChange: pokemonMovers.topDecliner.percentChange,
    };
    console.log(`  Biggest Pokemon decliner: ${pokemonMovers.topDecliner.cardName} (${pokemonMovers.topDecliner.percentChange.toFixed(1)}%)`);
  }

  const result: MarketTrendResult = {
    pokemon: pokemonTrend,
    updatedAt: new Date().toISOString(),
  };

  await sendPutWithRetry(
    pokemonS3,
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
