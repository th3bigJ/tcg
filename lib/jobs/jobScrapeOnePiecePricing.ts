import https from "https";
import type { RequestOptions } from "https";
import {
  buildOnePieceMarketEntry,
  loadOnePieceCardsForSet,
  loadOnePieceSets,
  priceKeyForOnePieceCard,
  type OnePieceCardEntry,
  type OnePieceSetEntry,
  type OnePieceSetMarketMap,
  updateOnePieceHistoryWithDailyMarket,
  writeOnePieceMarketForSet,
} from "@/lib/onepiecePricing";

export interface ScrapeOnePiecePricingOptions {
  dryRun?: boolean;
  onlySetCodes?: string[];
}

type TcgCardItem = {
  productId: number | null;
  productName: string;
  rarityName: string | null;
  marketPrice?: number | null;
  lowestPrice?: number | null;
  lowestPriceWithShipping?: number | null;
  medianPrice?: number | null;
  totalListings?: number | null;
  customAttributes: {
    number: string | null;
  } | null;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TCG_SEARCH_URL =
  "https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false";

function postJson(url: string, body: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": UA,
          "Content-Length": Buffer.byteLength(body),
        },
      } as RequestOptions,
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTcgPlayerSetCards(set: OnePieceSetEntry): Promise<TcgCardItem[]> {
  if (!set.tcgplayerId) return [];

  const all: TcgCardItem[] = [];
  let from = 0;
  const size = 50;
  let total: number | null = null;
  const setId = Number(set.tcgplayerId);

  while (total === null || from < total) {
    const body = JSON.stringify({
      algorithm: "revenue_desc",
      from,
      size,
      filters: {
        term: { productLineName: ["One Piece Card Game"], setId: [setId] },
        range: {},
        match: {},
      },
      context: { shippingCountry: "US", cart: {} },
      settings: { useFuzzySearch: false, didYouMean: {} },
    });

    let data: unknown;
    try {
      data = await postJson(TCG_SEARCH_URL, body);
    } catch {
      await sleep(2000);
      data = await postJson(TCG_SEARCH_URL, body);
    }

    const result = (data as { results?: Array<{ totalResults?: number; results?: TcgCardItem[] }> })
      ?.results?.[0];
    if (!result) break;

    const items = result.results ?? [];
    if (total === null) total = result.totalResults ?? items.length;

    const validItems = items.filter((item) => {
      if (!item.rarityName || item.rarityName === "None") return false;
      if (!item.customAttributes?.number) return false;
      return true;
    });

    all.push(...validItems);
    from += items.length;
    if (items.length < size) break;
    await sleep(300);
  }

  return all;
}

function buildMarketMap(cards: OnePieceCardEntry[], items: TcgCardItem[], nowIso: string): OnePieceSetMarketMap {
  const byProductId = new Map(items.map((item) => [String(item.productId ?? ""), item]));
  const marketMap: OnePieceSetMarketMap = {};

  for (const card of cards) {
    const key = priceKeyForOnePieceCard(card);
    const item = byProductId.get(key);
    marketMap[key] = buildOnePieceMarketEntry(
      item
        ? {
            marketPrice: toFiniteNumber(item.marketPrice),
            lowestPrice: toFiniteNumber(item.lowestPrice),
            lowestPriceWithShipping: toFiniteNumber(item.lowestPriceWithShipping),
            medianPrice: toFiniteNumber(item.medianPrice),
            totalListings: toFiniteInteger(item.totalListings),
          }
        : null,
      nowIso,
    );
  }

  return marketMap;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function toFiniteInteger(value: unknown): number | null {
  const num = toFiniteNumber(value);
  return num === null ? null : Math.round(num);
}

async function scrapeSet(set: OnePieceSetEntry, dryRun: boolean): Promise<void> {
  const cards = loadOnePieceCardsForSet(set.setCode);
  if (!cards.length) {
    console.log(`  [${set.setCode}] skip — no cards in onepiece/cards/data/${set.setCode}.json`);
    return;
  }

  console.log(`  [${set.setCode}] fetching TCGPlayer market prices…`);
  const items = await fetchTcgPlayerSetCards(set);
  const nowIso = new Date().toISOString();
  const marketMap = buildMarketMap(cards, items, nowIso);
  const priced = Object.values(marketMap).filter((entry) => entry.tcgplayer?.marketPrice != null).length;

  if (dryRun) {
    console.log(`  [${set.setCode}] ${priced}/${cards.length} cards have marketPrice (dry-run — no files written)`);
    return;
  }

  await writeOnePieceMarketForSet(set.setCode, marketMap);
  await updateOnePieceHistoryWithDailyMarket(set.setCode, marketMap);
  console.log(`  [${set.setCode}] wrote market/history/trends for ${cards.length} cards (${priced} with marketPrice)`);
}

export async function runScrapeOnePiecePricing(opts: ScrapeOnePiecePricingOptions = {}): Promise<void> {
  const { dryRun = false, onlySetCodes } = opts;
  const allSets = loadOnePieceSets();
  const requested = onlySetCodes?.map((value) => value.trim().toUpperCase()).filter(Boolean);

  const sets = requested?.length
    ? allSets.filter((set) => requested.includes(set.setCode.toUpperCase()))
    : allSets.filter((set) => Boolean(set.tcgplayerId));

  if (requested?.length && sets.length === 0) {
    throw new Error(`No One Piece sets found matching: ${requested.join(", ")}`);
  }

  const label = requested?.length ? requested.join(", ") : "all sets";
  console.log(`=== One Piece pricing scrape (${label}) ===`);
  if (dryRun) console.log("(dry-run: no files written)\n");

  for (const set of sets) {
    await scrapeSet(set, dryRun);
  }

  console.log("\nDone.");
}
