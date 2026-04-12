import {
  buildLorcanaMarketEntry,
  loadLorcanaCardsForSet,
  loadLorcanaCardsForSetFromR2,
  loadLorcanaSets,
  loadLorcanaSetsFromR2,
  priceKeyForLorcanaCard,
  selectScrydexRawPriceForCard,
  type LorcanaCardEntry,
  type LorcanaSetEntry,
  type LorcanaSetMarketMap,
  updateLorcanaHistoryWithDailyMarket,
  writeLorcanaMarketForSet,
} from "@/lib/lorcanaPricing";
import { fetchScrydexCardPageHtml, parseScrydexCardPageRawNearMintUsd } from "@/lib/scrydexMepCardPagePricing";

export interface ScrapeLorcanaPricingOptions {
  dryRun?: boolean;
  onlySetCodes?: string[];
  source?: "local" | "r2";
}

type RawPriceMap = Record<string, number>;

function scrydexQueryVariant(card: LorcanaCardEntry): string {
  return card.variant?.trim() || "normal";
}

function cardPagePath(card: LorcanaCardEntry): string | null {
  if (!card.scrydexSlug?.trim()) return null;
  return `/lorcana/cards/${card.scrydexSlug.trim()}/${card.cardNumber.trim().toUpperCase()}`;
}

function cardPageCacheKey(card: LorcanaCardEntry): string | null {
  const path = cardPagePath(card);
  if (!path) return null;
  return `${path}?variant=${encodeURIComponent(scrydexQueryVariant(card))}`;
}

async function loadRawPricesForCardPath(
  cache: Map<string, RawPriceMap>,
  card: LorcanaCardEntry,
): Promise<RawPriceMap> {
  const key = cardPageCacheKey(card);
  if (!key) return {};

  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const path = cardPagePath(card)!;
    const html = await fetchScrydexCardPageHtml(path, scrydexQueryVariant(card));
    const prices = parseScrydexCardPageRawNearMintUsd(html);
    cache.set(key, prices);
    return prices;
  } catch {
    cache.set(key, {});
    return {};
  }
}

async function buildMarketMap(
  setCode: string,
  cards: LorcanaCardEntry[],
  nowIso: string,
): Promise<LorcanaSetMarketMap> {
  const marketMap: LorcanaSetMarketMap = {};
  const cache = new Map<string, RawPriceMap>();
  let missingSlug = 0;

  for (const card of cards) {
    if (!card.scrydexSlug?.trim()) missingSlug += 1;

    const rawPrices = await loadRawPricesForCardPath(cache, card);
    const marketPrice = selectScrydexRawPriceForCard(rawPrices, card);
    marketMap[priceKeyForLorcanaCard(card)] = buildLorcanaMarketEntry(
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
      `  [${setCode}] ${missingSlug}/${cards.length} cards have no scrydexSlug — Scrydex prices are skipped for those.`,
    );
  }

  return marketMap;
}

async function scrapeSet(set: LorcanaSetEntry, dryRun: boolean, source: "local" | "r2"): Promise<void> {
  const cards =
    source === "r2" ? await loadLorcanaCardsForSetFromR2(set.setCode) : loadLorcanaCardsForSet(set.setCode);
  if (!cards.length) {
    console.log(
      `  [${set.setCode}] skip — no cards found in ${source === "r2" ? "R2 lorcana/cards/data" : `data/lorcana/cards/data/${set.setCode}.json`}`,
    );
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

  await writeLorcanaMarketForSet(set.setCode, marketMap);
  await updateLorcanaHistoryWithDailyMarket(set.setCode, marketMap);
  console.log(`  [${set.setCode}] wrote market/history/trends for ${cards.length} cards (${priced} with marketPrice)`);
}

export async function runScrapeLorcanaPricing(opts: ScrapeLorcanaPricingOptions = {}): Promise<void> {
  const { dryRun = false, onlySetCodes, source = "local" } = opts;
  const allSets = source === "r2" ? await loadLorcanaSetsFromR2() : loadLorcanaSets();
  const requested = onlySetCodes?.map((value) => value.trim().toUpperCase()).filter(Boolean);

  const sets = requested?.length
    ? allSets.filter((set) => requested.includes(set.setCode.toUpperCase()))
    : allSets.filter((set) => Boolean(set.scrydexId));

  if (requested?.length && sets.length === 0) {
    throw new Error(`No Lorcana sets found matching: ${requested.join(", ")}`);
  }

  const label = requested?.length ? requested.join(", ") : "all sets";
  console.log(`=== Lorcana pricing scrape (${label}) ===`);
  if (dryRun) console.log("(dry-run: no files written)\n");

  for (const set of sets) {
    await scrapeSet(set, dryRun, source);
  }

  console.log("\nDone.");
}
