/**
 * One-time migration: existing R2 pricing JSON was stored in **GBP**; this divides all price
 * numbers by `usdToGbp` (GBP per 1 USD) so blobs match the new **USD** storage convention.
 *
 * Historical caveat: each scrape used that day’s FX; this uses a **single** rate for every
 * point (default: Frankfurter latest, or `MIGRATE_GBP_PER_USD` = same meaning as
 * `MARKET_PRICE_FALLBACK_USD_TO_GBP`: GBP per 1 USD).
 *
 * Usage:
 *   node --import tsx/esm scripts/migrateR2PricingGbpToUsd.ts --dry-run
 *   node --import tsx/esm scripts/migrateR2PricingGbpToUsd.ts
 *   MIGRATE_GBP_PER_USD=0.79 node --import tsx/esm scripts/migrateR2PricingGbpToUsd.ts
 */

import fs from "node:fs";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import {
  R2_SEALED_POKEDATA_DEFAULT_SLUG,
  r2SealedPokedataPriceHistoryKey,
  r2SealedPokedataPriceTrendsKey,
  r2SinglesCardPricingPrefix,
  r2SinglesPriceHistoryPrefix,
  r2SinglesPriceTrendsPrefix,
} from "../lib/r2BucketLayout";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";
import type {
  CardPriceHistory,
  CardPriceTrendSummary,
  GradeTrendSummary,
  PriceHistoryWindow,
  SealedProductPriceHistory,
  SealedProductPriceHistoryMap,
  SealedProductPriceTrendMap,
  SetPriceHistoryMap,
  SetPriceTrendMap,
  SetPricingMap,
} from "../lib/staticDataTypes";

loadEnvFilesFromRepoRoot(import.meta.url);

const dryRun = process.argv.includes("--dry-run");

async function fetchUsdToGbpFrankfurter(): Promise<number> {
  const res = await fetch("https://api.frankfurter.app/latest?from=GBP&to=USD");
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const data = (await res.json()) as { rates?: { USD?: number } };
  const usdPerGbp = data.rates?.USD;
  if (!usdPerGbp || usdPerGbp <= 0) throw new Error("Bad Frankfurter rate");
  return 1 / usdPerGbp;
}

function resolveUsdToGbp(): number {
  const env = process.env.MIGRATE_GBP_PER_USD ?? process.env.MARKET_PRICE_FALLBACK_USD_TO_GBP;
  if (env) {
    const n = Number.parseFloat(env);
    if (Number.isFinite(n) && n > 0) return n;
  }
  throw new Error("Set MIGRATE_GBP_PER_USD (GBP per 1 USD) or ensure Frankfurter is reachable.");
}

function divideWindow(w: PriceHistoryWindow, inv: number): PriceHistoryWindow {
  return {
    daily: w.daily.map(([k, v]) => [k, v * inv]),
    weekly: w.weekly.map(([k, v]) => [k, v * inv]),
    monthly: w.monthly.map(([k, v]) => [k, v * inv]),
  };
}

function migrateCardPriceHistory(h: CardPriceHistory, inv: number): CardPriceHistory {
  const out: CardPriceHistory = {};
  for (const [variant, grades] of Object.entries(h)) {
    out[variant] = {};
    for (const [grade, window] of Object.entries(grades)) {
      if (!window || typeof window !== "object") continue;
      out[variant][grade] = divideWindow(window as PriceHistoryWindow, inv);
    }
  }
  return out;
}

function divideGradeTrend(g: GradeTrendSummary, inv: number): GradeTrendSummary {
  return { ...g, current: g.current * inv };
}

function migrateCardTrendSummary(s: CardPriceTrendSummary, inv: number): CardPriceTrendSummary {
  const allVariants = s.allVariants
    ? Object.fromEntries(
        Object.entries(s.allVariants).map(([vk, vm]) => [
          vk,
          Object.fromEntries(
            Object.entries(vm).map(([gk, g]) => [gk, divideGradeTrend(g, inv)]),
          ),
        ]),
      )
    : undefined;
  return { ...s, current: s.current * inv, allVariants };
}

function migrateSetPriceTrendMap(m: SetPriceTrendMap, inv: number): SetPriceTrendMap {
  const out: SetPriceTrendMap = {};
  for (const [id, s] of Object.entries(m)) {
    out[id] = migrateCardTrendSummary(s, inv);
  }
  return out;
}

function migrateSetPricingMap(m: SetPricingMap, inv: number): SetPricingMap {
  const out: SetPricingMap = {};
  for (const [extId, entry] of Object.entries(m)) {
    const sc = entry.scrydex;
    if (sc && typeof sc === "object" && !Array.isArray(sc)) {
      const nextSc: Record<string, { raw?: number; psa10?: number; ace10?: number }> = {};
      for (const [vk, block] of Object.entries(sc)) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        const n: { raw?: number; psa10?: number; ace10?: number } = {};
        if (typeof b.raw === "number" && Number.isFinite(b.raw)) n.raw = b.raw * inv;
        if (typeof b.psa10 === "number" && Number.isFinite(b.psa10)) n.psa10 = b.psa10 * inv;
        if (typeof b.ace10 === "number" && Number.isFinite(b.ace10)) n.ace10 = b.ace10 * inv;
        if (Object.keys(n).length > 0) nextSc[vk] = n;
      }
      out[extId] = { ...entry, scrydex: nextSc };
    } else {
      out[extId] = entry;
    }
  }
  return out;
}

function migrateSetPriceHistoryMap(m: SetPriceHistoryMap, inv: number): SetPriceHistoryMap {
  const out: SetPriceHistoryMap = {};
  for (const [extId, cardH] of Object.entries(m)) {
    out[extId] = migrateCardPriceHistory(cardH, inv);
  }
  return out;
}

function migrateSealedHistoryMap(m: SealedProductPriceHistoryMap, inv: number): SealedProductPriceHistoryMap {
  const out: SealedProductPriceHistoryMap = {};
  for (const [id, h] of Object.entries(m)) {
    out[id] = divideWindow(h as SealedProductPriceHistory, inv);
  }
  return out;
}

function migrateSealedTrendMap(m: SealedProductPriceTrendMap, inv: number): SealedProductPriceTrendMap {
  const out: SealedProductPriceTrendMap = {};
  for (const [id, s] of Object.entries(m)) {
    out[id] = {
      ...s,
      current: s.current * inv,
    };
  }
  return out;
}

function buildS3(): S3Client {
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

async function getObjectJson<T>(s3: S3Client, bucket: string, key: string): Promise<T | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = res.Body;
    if (!body) return null;
    const text = await body.transformToString();
    return JSON.parse(text) as T;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "NoSuchKey") {
      return null;
    }
    throw e;
  }
}

async function putJson(s3: S3Client, bucket: string, key: string, value: unknown): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: "application/json",
    }),
  );
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

type SetJsonEntry = { setKey: string };

async function main(): Promise<void> {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET is not set");

  let usdToGbp: number;
  try {
    usdToGbp = await fetchUsdToGbpFrankfurter();
  } catch {
    usdToGbp = resolveUsdToGbp();
  }
  const inv = 1 / usdToGbp;
  console.log(`Using GBP-per-USD (usdToGbp) = ${usdToGbp.toFixed(6)}  →  divide stored GBP by this to get USD (factor ${inv.toFixed(6)})\n`);

  const s3 = buildS3();
  const sets = readJson<SetJsonEntry[]>(path.join(pokemonLocalDataRoot, "sets.json"));

  let setsUpdated = 0;
  let setsSkipped = 0;

  for (const set of sets) {
    const setCode = (set.setKey ?? "").trim();
    if (!setCode) continue;

    const pricingKey = `${r2SinglesCardPricingPrefix}/${setCode}.json`;
    const historyKey = `${r2SinglesPriceHistoryPrefix}/${setCode}.json`;
    const trendsKey = `${r2SinglesPriceTrendsPrefix}/${setCode}.json`;

    const pricing = await getObjectJson<SetPricingMap>(s3, bucket, pricingKey);
    const history = await getObjectJson<SetPriceHistoryMap>(s3, bucket, historyKey);
    const trends = await getObjectJson<SetPriceTrendMap>(s3, bucket, trendsKey);

    if (!pricing && !history && !trends) {
      setsSkipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] ${setCode}: would migrate ${pricing ? "pricing" : ""} ${history ? "history" : ""} ${trends ? "trends" : ""}`);
      setsUpdated++;
      continue;
    }

    if (pricing) await putJson(s3, bucket, pricingKey, migrateSetPricingMap(pricing, inv));
    if (history) await putJson(s3, bucket, historyKey, migrateSetPriceHistoryMap(history, inv));
    if (trends) await putJson(s3, bucket, trendsKey, migrateSetPriceTrendMap(trends, inv));

    console.log(`OK ${setCode}`);
    setsUpdated++;
  }

  const sealedSlug = R2_SEALED_POKEDATA_DEFAULT_SLUG;
  const sealedHistKey = r2SealedPokedataPriceHistoryKey(sealedSlug);
  const sealedTrendKey = r2SealedPokedataPriceTrendsKey(sealedSlug);

  const sealedHist = await getObjectJson<SealedProductPriceHistoryMap>(s3, bucket, sealedHistKey);
  const sealedTrends = await getObjectJson<SealedProductPriceTrendMap>(s3, bucket, sealedTrendKey);

  if (sealedHist || sealedTrends) {
    if (dryRun) {
      console.log(`[dry-run] sealed ${sealedSlug}: would migrate history/trends`);
    } else {
      if (sealedHist) await putJson(s3, bucket, sealedHistKey, migrateSealedHistoryMap(sealedHist, inv));
      if (sealedTrends) await putJson(s3, bucket, sealedTrendKey, migrateSealedTrendMap(sealedTrends, inv));
      console.log(`OK sealed ${sealedSlug}`);
    }
  }

  console.log(`\nDone. Sets touched: ${setsUpdated}, sets with no R2 files: ${setsSkipped}.`);
  if (dryRun) console.log("Re-run without --dry-run to upload.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
