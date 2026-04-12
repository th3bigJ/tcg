import fs from "fs";
import path from "path";
import { buildTrendMapFromHistoryMap } from "@/lib/r2PriceTrends";
import { mergeSetPriceHistoryMaps, todayKey, upsertAndTrim } from "@/lib/r2PriceHistory";
import { buildLorcanaS3Client, getJsonFromLorcanaR2, putJsonToLorcanaR2 } from "@/lib/lorcanaR2";
import { lorcanaLocalDataRoot } from "@/lib/lorcanaLocalDataPaths";
import type {
  CardPriceHistory,
  CardPriceTrendSummary,
  PriceHistoryPoint,
  PriceHistoryWindow,
  SetPriceHistoryMap,
  SetPriceTrendMap,
} from "@/lib/staticDataTypes";

const DAILY_HISTORY_LIMIT = 31;
const WEEKLY_HISTORY_LIMIT = 52;
const MONTHLY_HISTORY_LIMIT = 60;

const LORCANA_ROOT = lorcanaLocalDataRoot;
const LORCANA_SETS_FILE = path.join(LORCANA_ROOT, "sets", "data", "sets.json");
const LORCANA_CARDS_DIR = path.join(LORCANA_ROOT, "cards", "data");
const LORCANA_PRICING_DIR = path.join(LORCANA_ROOT, "pricing");
const LORCANA_MARKET_DIR = path.join(LORCANA_PRICING_DIR, "market");
const LORCANA_HISTORY_DIR = path.join(LORCANA_PRICING_DIR, "history");
const LORCANA_TRENDS_DIR = path.join(LORCANA_PRICING_DIR, "trends");

export type LorcanaSetEntry = {
  id: string;
  setCode: string;
  name: string;
  scrydexId: string | null;
  releaseDate?: string | null;
  cardCount?: number | null;
};

/** Print types from Scrydex / card JSON `variant` field. */
export type LorcanaCardVariant = "normal" | "holofoil" | "coldFoil" | (string & {});

export type LorcanaCardEntry = {
  priceKey: string;
  cardNumber: string;
  name: string;
  setCode: string;
  variant: LorcanaCardVariant;
  scrydexSlug: string | null;
};

export type LorcanaTcgplayerMarket = {
  marketPrice: number | null;
  lowestPrice: number | null;
  lowestPriceWithShipping: number | null;
  medianPrice: number | null;
  totalListings: number | null;
  updatedAt: string;
};

export type LorcanaMarketEntry = {
  scrydex: null;
  tcgplayer: LorcanaTcgplayerMarket | null;
  cardmarket: null;
};

export type LorcanaSetMarketMap = Record<string, LorcanaMarketEntry>;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readJsonIfExists<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return readJson<T>(filePath);
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

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function currentWeekKey(date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${pad2(week)}`;
}

function currentMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

function weekKeyFromDateKey(dateKey: string): string {
  return currentWeekKey(new Date(`${dateKey}T00:00:00.000Z`));
}

function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
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

export function ensureLorcanaPricingDirs(): void {
  fs.mkdirSync(LORCANA_MARKET_DIR, { recursive: true });
  fs.mkdirSync(LORCANA_HISTORY_DIR, { recursive: true });
  fs.mkdirSync(LORCANA_TRENDS_DIR, { recursive: true });
}

/** When true, read/write `data/lorcana/pricing/{market,history,trends}` on disk instead of R2. */
export function useLorcanaPricingLocalFiles(): boolean {
  const v = process.env.LORCANA_PRICING_LOCAL?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

export function loadLorcanaSets(): LorcanaSetEntry[] {
  return readJson<LorcanaSetEntry[]>(LORCANA_SETS_FILE);
}

export async function loadLorcanaSetsFromR2(): Promise<LorcanaSetEntry[]> {
  const s3 = buildLorcanaS3Client();
  return (await getJsonFromLorcanaR2<LorcanaSetEntry[]>(s3, "sets/data/sets.json")) ?? [];
}

export function loadLorcanaCardsForSet(setCode: string): LorcanaCardEntry[] {
  const filePath = path.join(LORCANA_CARDS_DIR, `${setCode}.json`);
  if (!fs.existsSync(filePath)) return [];
  return readJson<LorcanaCardEntry[]>(filePath);
}

export async function loadLorcanaCardsForSetFromR2(setCode: string): Promise<LorcanaCardEntry[]> {
  const code = setCode.trim().toUpperCase();
  if (!code) return [];

  const s3 = buildLorcanaS3Client();
  return (await getJsonFromLorcanaR2<LorcanaCardEntry[]>(s3, `cards/data/${code}.json`)) ?? [];
}

export function marketFilePathForSet(setCode: string): string {
  return path.join(LORCANA_MARKET_DIR, `${setCode}.json`);
}

export function historyFilePathForSet(setCode: string): string {
  return path.join(LORCANA_HISTORY_DIR, `${setCode}.json`);
}

export function trendsFilePathForSet(setCode: string): string {
  return path.join(LORCANA_TRENDS_DIR, `${setCode}.json`);
}

function marketR2PathForSet(setCode: string): string {
  return `pricing/market/${setCode}.json`;
}

function historyR2PathForSet(setCode: string): string {
  return `pricing/history/${setCode}.json`;
}

function trendsR2PathForSet(setCode: string): string {
  return `pricing/trends/${setCode}.json`;
}

export async function loadLorcanaHistoryForSet(setCode: string): Promise<SetPriceHistoryMap> {
  if (useLorcanaPricingLocalFiles()) {
    return readJsonIfExists<SetPriceHistoryMap>(historyFilePathForSet(setCode), {});
  }
  const s3 = buildLorcanaS3Client();
  return (await getJsonFromLorcanaR2<SetPriceHistoryMap>(s3, historyR2PathForSet(setCode))) ?? {};
}

export async function loadLorcanaMarketForSet(setCode: string): Promise<LorcanaSetMarketMap> {
  if (useLorcanaPricingLocalFiles()) {
    return readJsonIfExists<LorcanaSetMarketMap>(marketFilePathForSet(setCode), {});
  }
  const s3 = buildLorcanaS3Client();
  return (await getJsonFromLorcanaR2<LorcanaSetMarketMap>(s3, marketR2PathForSet(setCode))) ?? {};
}

export async function writeLorcanaMarketForSet(setCode: string, marketMap: LorcanaSetMarketMap): Promise<void> {
  if (useLorcanaPricingLocalFiles()) {
    ensureLorcanaPricingDirs();
    writeJsonFile(marketFilePathForSet(setCode), marketMap);
    return;
  }
  const s3 = buildLorcanaS3Client();
  await putJsonToLorcanaR2(s3, marketR2PathForSet(setCode), marketMap);
}

export async function writeLorcanaHistoryForSet(setCode: string, historyMap: SetPriceHistoryMap): Promise<void> {
  if (useLorcanaPricingLocalFiles()) {
    ensureLorcanaPricingDirs();
    writeJsonFile(historyFilePathForSet(setCode), historyMap);
    return;
  }
  const s3 = buildLorcanaS3Client();
  await putJsonToLorcanaR2(s3, historyR2PathForSet(setCode), historyMap);
}

export async function writeLorcanaTrendsForSet(setCode: string, trendMap: SetPriceTrendMap): Promise<void> {
  if (useLorcanaPricingLocalFiles()) {
    ensureLorcanaPricingDirs();
    writeJsonFile(trendsFilePathForSet(setCode), trendMap);
    return;
  }
  const s3 = buildLorcanaS3Client();
  await putJsonToLorcanaR2(s3, trendsR2PathForSet(setCode), trendMap);
}

export async function writeLorcanaTrendsFromHistory(setCode: string, historyMap: SetPriceHistoryMap): Promise<SetPriceTrendMap> {
  const trendMap = buildTrendMapFromHistoryMap(historyMap);
  await writeLorcanaTrendsForSet(setCode, trendMap);
  return trendMap;
}

export async function mergeLorcanaHistoryForSet(setCode: string, incoming: SetPriceHistoryMap): Promise<SetPriceHistoryMap> {
  const existing = await loadLorcanaHistoryForSet(setCode);
  const merged = mergeSetPriceHistoryMaps(existing, incoming);
  await writeLorcanaHistoryForSet(setCode, merged);
  await writeLorcanaTrendsFromHistory(setCode, merged);
  return merged;
}

export function priceKeyForLorcanaCard(card: LorcanaCardEntry): string {
  const direct = card.priceKey?.trim();
  if (direct) return direct;
  return [card.setCode.trim().toUpperCase(), card.cardNumber.trim().toUpperCase(), card.variant || "normal"].join("::");
}

function normalizeVariantLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Label keys returned by `parseScrydexCardPageRawNearMintUsd` (via `scrydexRawVariantSlugToLabel`)
 * must match one of the normalized candidates here.
 */
export function scrydexHistoryCandidatesForLorcanaVariant(variant: LorcanaCardVariant): string[] {
  switch (variant) {
    case "holofoil":
      return ["holofoil", "Holofoil", "normal", "Normal"];
    case "coldFoil":
      return ["coldFoil", "cold Foil", "Cold Foil", "coldfoil", "normal"];
    case "normal":
      return ["normal", "Normal", "default", "Default"];
    default:
      return [variant, normalizeVariantLabel(variant), "normal", "default"];
  }
}

export function selectScrydexRawPriceForCard(
  pricesByLabel: Record<string, number>,
  card: LorcanaCardEntry,
): number | null {
  const normalized = new Map<string, number>();
  for (const [label, price] of Object.entries(pricesByLabel)) {
    if (typeof price !== "number" || !Number.isFinite(price)) continue;
    normalized.set(normalizeVariantLabel(label), price);
  }

  for (const candidate of scrydexHistoryCandidatesForLorcanaVariant(card.variant)) {
    const match = normalized.get(normalizeVariantLabel(candidate));
    if (typeof match === "number" && Number.isFinite(match)) return match;
  }

  return null;
}

export function selectScrydexRawHistoryForCard(
  historyByLabel: Record<string, PriceHistoryPoint[]>,
  card: LorcanaCardEntry,
): PriceHistoryPoint[] | null {
  const normalized = new Map<string, PriceHistoryPoint[]>();
  for (const [label, points] of Object.entries(historyByLabel)) {
    normalized.set(normalizeVariantLabel(label), points);
  }

  for (const candidate of scrydexHistoryCandidatesForLorcanaVariant(card.variant)) {
    const match = normalized.get(normalizeVariantLabel(candidate));
    if (match?.length) return match;
  }

  return null;
}

export function buildLorcanaMarketEntry(
  price: Omit<LorcanaTcgplayerMarket, "updatedAt"> | null,
  updatedAt: string,
): LorcanaMarketEntry {
  return {
    scrydex: null,
    tcgplayer: price ? { ...price, updatedAt } : null,
    cardmarket: null,
  };
}

export async function updateLorcanaHistoryWithDailyMarket(
  setCode: string,
  marketMap: LorcanaSetMarketMap,
  now = new Date(),
): Promise<SetPriceHistoryMap> {
  const historyMap = await loadLorcanaHistoryForSet(setCode);
  const dailyKey = todayKey(now);
  const weekKey = currentWeekKey(now);
  const monthKey = currentMonthKey(now);

  for (const [priceKey, entry] of Object.entries(marketMap)) {
    const marketPrice = entry.tcgplayer?.marketPrice;
    if (typeof marketPrice !== "number" || !Number.isFinite(marketPrice)) continue;

    const cardHistory = historyMap[priceKey] ?? {};
    const current = ensureWindow(cardHistory.default?.raw);
    const daily = upsertAndTrim(current.daily, dailyKey, marketPrice, DAILY_HISTORY_LIMIT);
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

    cardHistory.default ??= {};
    cardHistory.default.raw = { daily, weekly, monthly };
    historyMap[priceKey] = cardHistory;
  }

  await writeLorcanaHistoryForSet(setCode, historyMap);
  await writeLorcanaTrendsFromHistory(setCode, historyMap);
  return historyMap;
}

export function buildRawHistoryWindow(points: PriceHistoryPoint[]): CardPriceHistory | null {
  const normalized = points.filter(isPriceHistoryPoint).sort((a, b) => a[0].localeCompare(b[0]));
  if (normalized.length === 0) return null;

  const daily = normalized.slice(-DAILY_HISTORY_LIMIT);
  const weekly = collapseAverageByBucket(normalized, weekKeyFromDateKey, WEEKLY_HISTORY_LIMIT);
  const monthly = collapseAverageByBucket(normalized, monthKeyFromDateKey, MONTHLY_HISTORY_LIMIT);

  return {
    default: {
      raw: { daily, weekly, monthly },
    },
  };
}

function collapseAverageByBucket(
  points: PriceHistoryPoint[],
  keyForPoint: (dateKey: string) => string,
  maxLen: number,
): PriceHistoryPoint[] {
  const byBucket = new Map<string, { total: number; count: number }>();
  for (const [dateKey, price] of points) {
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

export type LorcanaPrimaryTrendMap = Record<string, CardPriceTrendSummary>;
