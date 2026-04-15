import {
  buildOnePieceMarketEntry,
  loadOnePieceCardsForSet,
  loadOnePieceCardsForSetFromR2,
  loadOnePieceSets,
  loadOnePieceSetsFromR2,
  priceKeyForOnePieceCard,
  selectScrydexRawPriceForCard,
  type OnePieceCardEntry,
  type OnePieceSetEntry,
  type OnePieceSetMarketMap,
  updateOnePieceHistoryWithDailyMarket,
  writeOnePieceMarketForSet,
} from "@/lib/onepiecePricing";
import { fetchGumgumSetListHtml, gumgumPriceByCardIdFromListHtml } from "@/lib/gumgumOnePiece";
import { fetchScrydexCardPageHtml, parseScrydexCardPageRawNearMintUsd } from "@/lib/scrydexMepCardPagePricing";

export interface ScrapeOnePiecePricingOptions {
  dryRun?: boolean;
  onlySetCodes?: string[];
  source?: "local" | "r2";
}

type RawPriceMap = Record<string, number>;

function scrydexQueryVariant(card: OnePieceCardEntry): string {
  return card.variant?.trim() || "normal";
}

function cardPagePath(card: OnePieceCardEntry): string | null {
  if (!card.scrydexSlug?.trim()) return null;
  return `/onepiece/cards/${card.scrydexSlug.trim()}/${card.cardNumber.trim().toUpperCase()}`;
}

async function loadRawPricesForCardPath(
  cache: Map<string, RawPriceMap>,
  card: OnePieceCardEntry,
): Promise<RawPriceMap> {
  const path = cardPagePath(card);
  if (!path) return {};

  const cached = cache.get(path);
  if (cached) return cached;

  try {
    const html = await fetchScrydexCardPageHtml(path, scrydexQueryVariant(card));
    const prices = parseScrydexCardPageRawNearMintUsd(html);
    cache.set(path, prices);
    return prices;
  } catch {
    cache.set(path, {});
    return {};
  }
}

async function buildMarketMap(set: OnePieceSetEntry, cards: OnePieceCardEntry[], nowIso: string): Promise<OnePieceSetMarketMap> {
  const setCode = set.setCode;
  const marketMap: OnePieceSetMarketMap = {};
  const cache = new Map<string, RawPriceMap>();
  const gumgumPath = set.gumgumCardsListPath?.trim();
  let gumgumById: Record<string, number> = {};

  if (gumgumPath && cards.some((c) => c.gumgumCardId?.trim())) {
    try {
      console.log(`  [${setCode}] fetching GumGum list (${gumgumPath})…`);
      const listHtml = await fetchGumgumSetListHtml(gumgumPath);
      gumgumById = gumgumPriceByCardIdFromListHtml(listHtml);
    } catch (e) {
      console.warn(`  [${setCode}] GumGum list fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let missingPriceSource = 0;
  for (const card of cards) {
    const hasScrydex = Boolean(card.scrydexSlug?.trim());
    const gumId = card.gumgumCardId?.trim();
    const hasGumgum = Boolean(gumId);
    if (!hasScrydex && !hasGumgum) missingPriceSource += 1;

    let marketPrice: number | null = null;
    if (hasScrydex) {
      const rawPrices = await loadRawPricesForCardPath(cache, card);
      marketPrice = selectScrydexRawPriceForCard(rawPrices, card);
    } else if (hasGumgum) {
      const p = gumgumById[gumId!];
      if (typeof p === "number" && Number.isFinite(p)) marketPrice = p;
    }

    marketMap[priceKeyForOnePieceCard(card)] = buildOnePieceMarketEntry(
      marketPrice === null
        ? null
        : {
            marketPrice,
            lowestPrice: marketPrice,
            lowestPriceWithShipping: marketPrice,
            medianPrice: marketPrice,
            totalListings: null,
          },
      nowIso,
    );
  }

  if (missingPriceSource > 0) {
    console.warn(
      `  [${setCode}] ${missingPriceSource}/${cards.length} cards have neither scrydexSlug nor gumgumCardId — those rows get null marketPrice.`,
    );
  }

  return marketMap;
}

async function scrapeSet(set: OnePieceSetEntry, dryRun: boolean, source: "local" | "r2"): Promise<void> {
  const cards =
    source === "r2" ? await loadOnePieceCardsForSetFromR2(set.setCode) : loadOnePieceCardsForSet(set.setCode);
  if (!cards.length) {
    console.log(`  [${set.setCode}] skip — no cards found in ${source === "r2" ? "R2 onepiece/cards/data" : `data/onepiece/cards/data/${set.setCode}.json`}`);
    return;
  }

  console.log(`  [${set.setCode}] fetching prices…`);
  const nowIso = new Date().toISOString();
  const marketMap = await buildMarketMap(set, cards, nowIso);
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
  const { dryRun = false, onlySetCodes, source = "local" } = opts;
  const allSets = source === "r2" ? await loadOnePieceSetsFromR2() : loadOnePieceSets();
  const requested = onlySetCodes?.map((value) => value.trim().toUpperCase()).filter(Boolean);

  const sets = requested?.length
    ? allSets.filter((set) => requested.includes(set.setCode.toUpperCase()))
    : allSets.filter((set) => Boolean(set.scrydexId?.trim()) || Boolean(set.gumgumCardsListPath?.trim()));

  if (requested?.length && sets.length === 0) {
    throw new Error(`No One Piece sets found matching: ${requested.join(", ")}`);
  }

  const label = requested?.length ? requested.join(", ") : "all sets";
  console.log(`=== One Piece pricing scrape (${label}) ===`);
  if (dryRun) console.log("(dry-run: no files written)\n");

  for (const set of sets) {
    await scrapeSet(set, dryRun, source);
  }

  console.log("\nDone.");
}
