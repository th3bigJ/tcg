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

async function buildMarketMap(
  setCode: string,
  cards: OnePieceCardEntry[],
  nowIso: string,
): Promise<OnePieceSetMarketMap> {
  const marketMap: OnePieceSetMarketMap = {};
  const cache = new Map<string, RawPriceMap>();
  let missingSlug = 0;

  for (const card of cards) {
    if (!card.scrydexSlug?.trim()) missingSlug += 1;

    const rawPrices = await loadRawPricesForCardPath(cache, card);
    const marketPrice = selectScrydexRawPriceForCard(rawPrices, card);
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

  if (missingSlug > 0) {
    console.warn(
      `  [${setCode}] ${missingSlug}/${cards.length} cards have no scrydexSlug — Scrydex prices are skipped for those (backfill slugs from the expansion page).`,
    );
  }

  return marketMap;
}

async function scrapeSet(set: OnePieceSetEntry, dryRun: boolean, source: "local" | "r2"): Promise<void> {
  const cards =
    source === "r2" ? await loadOnePieceCardsForSetFromR2(set.setCode) : loadOnePieceCardsForSet(set.setCode);
  if (!cards.length) {
    console.log(`  [${set.setCode}] skip — no cards found in ${source === "r2" ? "R2 onepiece/cards/data" : `onepiece/cards/data/${set.setCode}.json`}`);
    return;
  }

  console.log(`  [${set.setCode}] fetching Scrydex prices…`);
  const nowIso = new Date().toISOString();
  const marketMap = await buildMarketMap(set.setCode, cards, nowIso);
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
    : allSets.filter((set) => Boolean(set.scrydexId));

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
