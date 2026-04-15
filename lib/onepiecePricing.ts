import fs from "fs";
import path from "path";
import { buildTrendMapFromHistoryMap } from "@/lib/r2PriceTrends";
import { mergeSetPriceHistoryMaps, todayKey, upsertAndTrim } from "@/lib/r2PriceHistory";
import { buildOnePieceS3Client, getJsonFromOnePieceR2, putJsonToOnePieceR2 } from "@/lib/onepieceR2";
import { onepieceLocalDataRoot } from "@/lib/onepieceLocalDataPaths";
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

const ONEPIECE_ROOT = onepieceLocalDataRoot;
const ONEPIECE_SETS_FILE = path.join(ONEPIECE_ROOT, "sets", "data", "sets.json");
const ONEPIECE_CARDS_DIR = path.join(ONEPIECE_ROOT, "cards", "data");
const ONEPIECE_PRICING_DIR = path.join(ONEPIECE_ROOT, "pricing");
const ONEPIECE_MARKET_DIR = path.join(ONEPIECE_PRICING_DIR, "market");
const ONEPIECE_HISTORY_DIR = path.join(ONEPIECE_PRICING_DIR, "history");
const ONEPIECE_TRENDS_DIR = path.join(ONEPIECE_PRICING_DIR, "trends");

export type OnePieceSetEntry = {
  id: string;
  setCode: string;
  name: string;
  tcgplayerId: string | null;
  scrydexId: string | null;
  /**
   * When Scrydex is not live yet, GumGum set list pathname (e.g. `/cards/ST29/egghead`).
   * @see https://gumgum.gg
   */
  gumgumCardsListPath?: string | null;
  setType: string | null;
  releaseDate?: string | null;
  cardCount?: number | null;
};

export type OnePieceCardVariant =
  | "normal"
  | "foil"
  | "parallel"
  | "altArt"
  | "fullArt"
  | "mangaAltArt"
  | "specialAltArt"
  | "boxTopper"
  | "promo"
  | "reprint"
  | "jollyRogerFoil"
  | (string & {});

export type OnePieceCardEntry = {
  priceKey?: string;
  tcgplayerProductId?: string | null;
  cardNumber: string;
  name: string;
  setCode: string;
  variant: OnePieceCardVariant;
  scrydexSlug: string | null;
  /** GumGum `id` query (e.g. `ST29-001` or `ST29-001_p1`) when pricing from gumgum.gg. */
  gumgumCardId?: string | null;
};

export type OnePieceTcgplayerMarket = {
  marketPrice: number | null;
  lowestPrice: number | null;
  lowestPriceWithShipping: number | null;
  medianPrice: number | null;
  totalListings: number | null;
  updatedAt: string;
};

export type OnePieceMarketEntry = {
  scrydex: null;
  tcgplayer: OnePieceTcgplayerMarket | null;
  cardmarket: null;
};

export type OnePieceSetMarketMap = Record<string, OnePieceMarketEntry>;

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

export function ensureOnePiecePricingDirs(): void {
  fs.mkdirSync(ONEPIECE_MARKET_DIR, { recursive: true });
  fs.mkdirSync(ONEPIECE_HISTORY_DIR, { recursive: true });
  fs.mkdirSync(ONEPIECE_TRENDS_DIR, { recursive: true });
}

/** When true, read/write `data/onepiece/pricing/{market,history,trends}` on disk instead of R2. */
export function useOnePiecePricingLocalFiles(): boolean {
  const v = process.env.ONEPIECE_PRICING_LOCAL?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

export function loadOnePieceSets(): OnePieceSetEntry[] {
  return readJson<OnePieceSetEntry[]>(ONEPIECE_SETS_FILE);
}

export async function loadOnePieceSetsFromR2(): Promise<OnePieceSetEntry[]> {
  const s3 = buildOnePieceS3Client();
  return (await getJsonFromOnePieceR2<OnePieceSetEntry[]>(s3, "sets/data/sets.json")) ?? [];
}

export function loadOnePieceCardsForSet(setCode: string): OnePieceCardEntry[] {
  const filePath = path.join(ONEPIECE_CARDS_DIR, `${setCode}.json`);
  if (!fs.existsSync(filePath)) return [];
  return readJson<OnePieceCardEntry[]>(filePath);
}

export async function loadOnePieceCardsForSetFromR2(setCode: string): Promise<OnePieceCardEntry[]> {
  const code = setCode.trim().toUpperCase();
  if (!code) return [];

  const s3 = buildOnePieceS3Client();
  return (await getJsonFromOnePieceR2<OnePieceCardEntry[]>(s3, `cards/data/${code}.json`)) ?? [];
}

export function marketFilePathForSet(setCode: string): string {
  return path.join(ONEPIECE_MARKET_DIR, `${setCode}.json`);
}

export function historyFilePathForSet(setCode: string): string {
  return path.join(ONEPIECE_HISTORY_DIR, `${setCode}.json`);
}

export function trendsFilePathForSet(setCode: string): string {
  return path.join(ONEPIECE_TRENDS_DIR, `${setCode}.json`);
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

export async function loadOnePieceHistoryForSet(setCode: string): Promise<SetPriceHistoryMap> {
  if (useOnePiecePricingLocalFiles()) {
    return readJsonIfExists<SetPriceHistoryMap>(historyFilePathForSet(setCode), {});
  }
  const s3 = buildOnePieceS3Client();
  return (await getJsonFromOnePieceR2<SetPriceHistoryMap>(s3, historyR2PathForSet(setCode))) ?? {};
}

export async function loadOnePieceMarketForSet(setCode: string): Promise<OnePieceSetMarketMap> {
  if (useOnePiecePricingLocalFiles()) {
    return readJsonIfExists<OnePieceSetMarketMap>(marketFilePathForSet(setCode), {});
  }
  const s3 = buildOnePieceS3Client();
  return (await getJsonFromOnePieceR2<OnePieceSetMarketMap>(s3, marketR2PathForSet(setCode))) ?? {};
}

export async function writeOnePieceMarketForSet(setCode: string, marketMap: OnePieceSetMarketMap): Promise<void> {
  if (useOnePiecePricingLocalFiles()) {
    ensureOnePiecePricingDirs();
    writeJsonFile(marketFilePathForSet(setCode), marketMap);
    return;
  }
  const s3 = buildOnePieceS3Client();
  await putJsonToOnePieceR2(s3, marketR2PathForSet(setCode), marketMap);
}

export async function writeOnePieceHistoryForSet(setCode: string, historyMap: SetPriceHistoryMap): Promise<void> {
  if (useOnePiecePricingLocalFiles()) {
    ensureOnePiecePricingDirs();
    writeJsonFile(historyFilePathForSet(setCode), historyMap);
    return;
  }
  const s3 = buildOnePieceS3Client();
  await putJsonToOnePieceR2(s3, historyR2PathForSet(setCode), historyMap);
}

export async function writeOnePieceTrendsForSet(setCode: string, trendMap: SetPriceTrendMap): Promise<void> {
  if (useOnePiecePricingLocalFiles()) {
    ensureOnePiecePricingDirs();
    writeJsonFile(trendsFilePathForSet(setCode), trendMap);
    return;
  }
  const s3 = buildOnePieceS3Client();
  await putJsonToOnePieceR2(s3, trendsR2PathForSet(setCode), trendMap);
}

export async function writeOnePieceTrendsFromHistory(setCode: string, historyMap: SetPriceHistoryMap): Promise<SetPriceTrendMap> {
  const trendMap = buildTrendMapFromHistoryMap(historyMap);
  await writeOnePieceTrendsForSet(setCode, trendMap);
  return trendMap;
}

export async function mergeOnePieceHistoryForSet(setCode: string, incoming: SetPriceHistoryMap): Promise<SetPriceHistoryMap> {
  const existing = await loadOnePieceHistoryForSet(setCode);
  const merged = mergeSetPriceHistoryMaps(existing, incoming);
  await writeOnePieceHistoryForSet(setCode, merged);
  await writeOnePieceTrendsFromHistory(setCode, merged);
  return merged;
}

export function priceKeyForOnePieceCard(card: OnePieceCardEntry): string {
  const direct = card.priceKey?.trim();
  if (direct) return direct;

  const legacy = card.tcgplayerProductId?.trim();
  if (legacy) return legacy;

  return [card.setCode.trim().toUpperCase(), card.cardNumber.trim().toUpperCase(), card.variant || "normal"].join("::");
}

export function buildOnePieceMarketEntry(
  price: Omit<OnePieceTcgplayerMarket, "updatedAt"> | null,
  updatedAt: string,
): OnePieceMarketEntry {
  return {
    scrydex: null,
    tcgplayer: price ? { ...price, updatedAt } : null,
    cardmarket: null,
  };
}

export async function updateOnePieceHistoryWithDailyMarket(
  setCode: string,
  marketMap: OnePieceSetMarketMap,
  now = new Date(),
): Promise<SetPriceHistoryMap> {
  const historyMap = await loadOnePieceHistoryForSet(setCode);
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

  await writeOnePieceHistoryForSet(setCode, historyMap);
  await writeOnePieceTrendsFromHistory(setCode, historyMap);
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

function normalizeVariantLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function scrydexHistoryCandidatesForVariant(variant: OnePieceCardVariant): string[] {
  switch (variant) {
    case "foil":
    case "parallel":
      return ["foil", "parallel", "normal"];
    case "altArt":
    case "fullArt":
      return ["altArt", "alt art", "fullArt", "full art"];
    case "mangaAltArt":
      // Never fall back to altArt — different SKU; Scrydex chart ids often omit manga while grid has NM.
      return ["mangaAltArt", "manga alt art"];
    case "specialAltArt":
      return ["specialAltArt", "special alt art"];
    case "jollyRogerFoil":
      return ["jollyRogerFoil", "jolly roger foil", "foil", "parallel", "normal"];
    case "reprint":
      return ["reprint", "normal"];
    case "boxTopper":
      return ["boxTopper", "box topper", "normal"];
    case "promo":
      return ["promo", "normal"];
    default:
      return [variant, normalizeVariantLabel(variant), "normal", "default"];
  }
}

export function selectScrydexRawPriceForCard(
  pricesByLabel: Record<string, number>,
  card: OnePieceCardEntry,
): number | null {
  const normalized = new Map<string, number>();
  for (const [label, price] of Object.entries(pricesByLabel)) {
    if (typeof price !== "number" || !Number.isFinite(price)) continue;
    normalized.set(normalizeVariantLabel(label), price);
  }

  for (const candidate of scrydexHistoryCandidatesForVariant(card.variant)) {
    const match = normalized.get(normalizeVariantLabel(candidate));
    if (typeof match === "number" && Number.isFinite(match)) return match;
  }

  return null;
}

export function selectScrydexRawHistoryForCard(
  historyByLabel: Record<string, PriceHistoryPoint[]>,
  card: OnePieceCardEntry,
): PriceHistoryPoint[] | null {
  const normalized = new Map<string, PriceHistoryPoint[]>();
  for (const [label, points] of Object.entries(historyByLabel)) {
    normalized.set(normalizeVariantLabel(label), points);
  }

  for (const candidate of scrydexHistoryCandidatesForVariant(card.variant)) {
    const match = normalized.get(normalizeVariantLabel(candidate));
    if (match?.length) return match;
  }

  return null;
}

export type OnePiecePrimaryTrendMap = Record<string, CardPriceTrendSummary>;
