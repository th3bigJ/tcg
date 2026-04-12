/**
 * Backfill Lorcana price history from Scrydex Raw NM chart series (merge into existing history).
 *   - Default (R2): reads/writes lorcana/pricing/history|trends on R2
 *   - Local: LORCANA_PRICING_LOCAL=1 → repo `data/lorcana/pricing/history|trends/`
 *
 * Uses the same daily/weekly/monthly window format as Pokémon / One Piece:
 * - daily: last 31 days
 * - weekly: last 52 ISO weeks, averaged from daily
 * - monthly: last 60 months, averaged from daily
 *
 * Raw NM only (no PSA). Cards without Raw charts are skipped.
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillLorcanaPriceHistory.ts
 *   node --import tsx/esm scripts/backfillLorcanaPriceHistory.ts --dry-run
 *   node --import tsx/esm scripts/backfillLorcanaPriceHistory.ts --set=TFC
 *   node --import tsx/esm scripts/backfillLorcanaPriceHistory.ts --set=TFC,D23
 *   LORCANA_PRICING_LOCAL=1 node --import tsx/esm scripts/backfillLorcanaPriceHistory.ts
 */

import {
  buildRawHistoryWindow,
  loadLorcanaCardsForSet,
  loadLorcanaSets,
  mergeLorcanaHistoryForSet,
  priceKeyForLorcanaCard,
  selectScrydexRawHistoryForCard,
  type LorcanaCardEntry,
  type LorcanaSetEntry,
} from "../lib/lorcanaPricing";
import { fetchScrydexCardPageHtml, parseScrydexCardPageRawNearMintHistoryUsd } from "../lib/scrydexMepCardPagePricing";
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

function scrydexQueryVariant(card: LorcanaCardEntry): string {
  return card.variant?.trim() || "normal";
}

function cardPagePath(card: LorcanaCardEntry): string | null {
  if (!card.scrydexSlug?.trim()) return null;
  return `/lorcana/cards/${card.scrydexSlug.trim()}/${card.cardNumber.trim().toUpperCase()}`;
}

async function loadRawHistoryForCardPath(
  cache: Map<string, RawHistoryByLabel>,
  card: LorcanaCardEntry,
): Promise<RawHistoryByLabel> {
  if (!card.scrydexSlug?.trim()) return {};

  const path = cardPagePath(card);
  if (!path) return {};

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

async function backfillSet(set: LorcanaSetEntry, dryRunMode: boolean): Promise<void> {
  const cards = loadLorcanaCardsForSet(set.setCode);
  if (!cards.length) {
    console.log(`  [${set.setCode}] skip — no cards in data/lorcana/cards/data/${set.setCode}.json`);
    return;
  }

  const cache = new Map<string, RawHistoryByLabel>();
  const historyMap: SetPriceHistoryMap = {};
  let built = 0;

  for (const card of cards) {
    if (!card.scrydexSlug?.trim()) continue;

    const historyByLabel = await loadRawHistoryForCardPath(cache, card);
    const points = selectScrydexRawHistoryForCard(historyByLabel, card);
    if (!points?.length) continue;

    const window = buildRawHistoryWindow(points);
    if (!window) continue;

    historyMap[priceKeyForLorcanaCard(card)] = window;
    built++;

    if (built % 50 === 0) {
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

  const merged = await mergeLorcanaHistoryForSet(set.setCode, historyMap);
  console.log(
    `  [${set.setCode}] merged ${Object.keys(historyMap).length} backfilled cards into pricing/history (${Object.keys(merged).length} total keys); trends updated`,
  );
}

async function main(): Promise<void> {
  const allSets = loadLorcanaSets();
  const sets = onlySetCodes?.length
    ? allSets.filter((set) => onlySetCodes.includes(set.setCode.toUpperCase()))
    : allSets.filter((set) => Boolean(set.scrydexId));

  if (onlySetCodes?.length && sets.length === 0) {
    throw new Error(`No Lorcana sets found matching: ${onlySetCodes.join(", ")}`);
  }

  const label = onlySetCodes?.length ? onlySetCodes.join(", ") : "all sets";
  console.log(`=== Lorcana price-history backfill (${label}) ===`);
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
