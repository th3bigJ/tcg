/**
 * Backfill One Piece price history from Scrydex chart data (merge into existing history).
 *   - Default (R2): reads/writes onepiece/pricing/history|trends on R2
 *   - Local: ONEPIECE_PRICING_LOCAL=1 → repo `data/onepiece/pricing/history|trends/`
 *
 * Uses the same daily/weekly/monthly window format as Pokemon:
 * - daily: last 31 days
 * - weekly: last 52 ISO weeks, averaged from daily
 * - monthly: last 60 months, averaged from daily
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillOnePiecePriceHistory.ts
 *   node --import tsx/esm scripts/backfillOnePiecePriceHistory.ts --dry-run
 *   node --import tsx/esm scripts/backfillOnePiecePriceHistory.ts --set=OP01
 *   node --import tsx/esm scripts/backfillOnePiecePriceHistory.ts --set=OP01,PRB01
 */

import {
  buildRawHistoryWindow,
  loadOnePieceCardsForSet,
  loadOnePieceSets,
  mergeOnePieceHistoryForSet,
  priceKeyForOnePieceCard,
  selectScrydexRawHistoryForCard,
  type OnePieceCardEntry,
  type OnePieceSetEntry,
} from "../lib/onepiecePricing";
import { parseScrydexCardPageRawNearMintHistoryUsd, fetchScrydexCardPageHtml } from "../lib/scrydexMepCardPagePricing";
import type { PriceHistoryPoint, SetPriceHistoryMap } from "../lib/staticDataTypes";
import { buildTrendMapFromHistoryMap } from "../lib/r2PriceTrends";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);
const dryRun = process.argv.includes("--dry-run");
const setArg = process.argv.find((arg) => arg.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((value) => value.trim().toUpperCase()).filter(Boolean)
  : undefined;

type RawHistoryByLabel = Record<string, PriceHistoryPoint[]>;

async function loadRawHistoryForCardPath(
  cache: Map<string, RawHistoryByLabel>,
  card: OnePieceCardEntry,
): Promise<RawHistoryByLabel> {
  if (!card.scrydexSlug) return {};

  const path = `/onepiece/cards/${card.scrydexSlug}/${card.cardNumber}`;
  const variantQuery = scrydexQueryVariant(card);
  const cacheKey = `${path}?variant=${variantQuery}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let html = "";
  try {
    html = await fetchScrydexCardPageHtml(path, variantQuery);
  } catch {
    cache.set(cacheKey, {});
    return {};
  }

  const historyByLabel = parseScrydexCardPageRawNearMintHistoryUsd(html);
  cache.set(cacheKey, historyByLabel);
  return historyByLabel;
}

function scrydexQueryVariant(card: OnePieceCardEntry): string {
  return card.variant?.trim() || "normal";
}

async function backfillSet(set: OnePieceSetEntry, dryRunMode: boolean): Promise<void> {
  const cards = loadOnePieceCardsForSet(set.setCode);
  if (!cards.length) {
    console.log(`  [${set.setCode}] skip — no cards in data/onepiece/cards/data/${set.setCode}.json`);
    return;
  }

  const cache = new Map<string, RawHistoryByLabel>();
  const historyMap: SetPriceHistoryMap = {};
  let built = 0;

  for (const card of cards) {
    if (!card.scrydexSlug) continue;

    const historyByLabel = await loadRawHistoryForCardPath(cache, card);
    const points = selectScrydexRawHistoryForCard(historyByLabel, card);
    if (!points?.length) continue;

    const window = buildRawHistoryWindow(points);
    if (!window) continue;

    historyMap[priceKeyForOnePieceCard(card)] = window;
    built++;

    if (built % 25 === 0) {
      console.log(`  [${set.setCode}] built history for ${built} cards…`);
    }
  }

  if (dryRunMode) {
    const trendMap = buildTrendMapFromHistoryMap(historyMap);
    console.log(
      `  [${set.setCode}] dry-run: ${Object.keys(historyMap).length} cards with backfilled history, ${Object.keys(trendMap).length} trend rows`,
    );
    return;
  }

  const merged = await mergeOnePieceHistoryForSet(set.setCode, historyMap);
  console.log(
    `  [${set.setCode}] merged ${Object.keys(historyMap).length} backfilled cards into data/onepiece/pricing/history/${set.setCode}.json (${Object.keys(merged).length} total keys)`,
  );
}

async function main(): Promise<void> {
  const allSets = loadOnePieceSets();
  const sets = onlySetCodes?.length
    ? allSets.filter((set) => onlySetCodes.includes(set.setCode.toUpperCase()))
    : allSets.filter((set) => Boolean(set.scrydexId));

  if (onlySetCodes?.length && sets.length === 0) {
    throw new Error(`No One Piece sets found matching: ${onlySetCodes.join(", ")}`);
  }

  const label = onlySetCodes?.length ? onlySetCodes.join(", ") : "all sets";
  console.log(`=== One Piece price-history backfill (${label}) ===`);
  if (dryRun) console.log("(dry-run: no files written)\n");

  for (const set of sets) {
    await backfillSet(set, dryRun);
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
