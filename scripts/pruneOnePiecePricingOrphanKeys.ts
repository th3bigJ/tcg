/**
 * Remove pricing rows whose keys no longer match any card in data/onepiece/cards/data/{set}.json.
 *
 * Historic rows used tcgplayerProductId as the map key (e.g. "482337"). Current data uses
 * priceKey (e.g. "OP02::OP02-008::foil"). mergeSetPriceHistoryMaps keeps old keys forever;
 * this script drops orphans in market + history, then **rebuilds trends from pruned history**
 * so trends cannot keep stale product-id keys (trends were drifting separately from history).
 *
 * Usage:
 *   node --import tsx/esm scripts/pruneOnePiecePricingOrphanKeys.ts
 *   node --import tsx/esm scripts/pruneOnePiecePricingOrphanKeys.ts --dry-run
 *   node --import tsx/esm scripts/pruneOnePiecePricingOrphanKeys.ts --set=OP02,OP15
 */

import fs from "fs";
import { buildTrendMapFromHistoryMap } from "../lib/r2PriceTrends";
import type { SetPriceHistoryMap } from "../lib/staticDataTypes";
import {
  ensureOnePiecePricingDirs,
  loadOnePieceCardsForSet,
  loadOnePieceSets,
  marketFilePathForSet,
  historyFilePathForSet,
  trendsFilePathForSet,
  priceKeyForOnePieceCard,
  type OnePieceCardEntry,
} from "../lib/onepiecePricing";

const dryRun = process.argv.includes("--dry-run");
const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  : null;

function allowedPriceKeys(cards: OnePieceCardEntry[]): Set<string> {
  return new Set(cards.map((c) => priceKeyForOnePieceCard(c)));
}

function pruneKeyedJsonFile(
  filePath: string,
  allowed: Set<string>,
): {
  removed: string[];
  before: number;
  after: number;
  pruned: Record<string, unknown> | null;
} {
  if (!fs.existsSync(filePath)) {
    return { removed: [], before: 0, after: 0, pruned: null };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { removed: [], before: 0, after: 0, pruned: null };
  }
  const keys = Object.keys(raw);
  const removed: string[] = [];
  const next: Record<string, unknown> = { ...raw };
  for (const k of keys) {
    if (!allowed.has(k)) {
      removed.push(k);
      delete next[k];
    }
  }
  const before = keys.length;
  const after = Object.keys(next).length;
  if (!dryRun && removed.length > 0) {
    fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + "\n");
  }
  return { removed, before, after, pruned: next };
}

async function main(): Promise<void> {
  ensureOnePiecePricingDirs();
  const allSets = loadOnePieceSets();
  const sets = onlySetCodes?.length
    ? allSets.filter((s) => onlySetCodes.includes(s.setCode.toUpperCase()))
    : allSets.filter((s) => Boolean(s.scrydexId));

  if (onlySetCodes?.length && sets.length === 0) {
    throw new Error(`No sets matched: ${onlySetCodes.join(", ")}`);
  }

  console.log(`=== Prune orphan One Piece pricing keys (${dryRun ? "dry-run" : "live"}) ===\n`);

  for (const set of sets) {
    const cards = loadOnePieceCardsForSet(set.setCode);
    const allowed = allowedPriceKeys(cards);
    if (cards.length === 0) {
      console.log(`[${set.setCode}] skip — no cards JSON`);
      continue;
    }

    const marketPath = marketFilePathForSet(set.setCode);
    const historyPath = historyFilePathForSet(set.setCode);
    const trendsPath = trendsFilePathForSet(set.setCode);

    let trendsBefore = 0;
    if (fs.existsSync(trendsPath)) {
      try {
        const tRaw = JSON.parse(fs.readFileSync(trendsPath, "utf8")) as Record<string, unknown>;
        trendsBefore = Object.keys(tRaw).length;
      } catch {
        trendsBefore = 0;
      }
    }

    const m = pruneKeyedJsonFile(marketPath, allowed);
    const h = pruneKeyedJsonFile(historyPath, allowed);

    const hist = h.pruned as SetPriceHistoryMap | null;
    let trendKeyCount = 0;
    if (hist && Object.keys(hist).length > 0) {
      const trendMap = buildTrendMapFromHistoryMap(hist);
      trendKeyCount = Object.keys(trendMap).length;
      if (!dryRun) {
        fs.writeFileSync(trendsPath, JSON.stringify(trendMap, null, 2) + "\n");
      }
    } else if (!dryRun && fs.existsSync(trendsPath)) {
      fs.writeFileSync(trendsPath, "{}\n");
    }

    const totalRemoved = m.removed.length + h.removed.length;
    const changed = totalRemoved > 0 || trendsBefore !== trendKeyCount;

    if (!changed && trendKeyCount > 0) {
      console.log(`[${set.setCode}] OK — ${allowed.size} keys; trends already match history (${trendKeyCount})`);
      continue;
    }

    console.log(`[${set.setCode}] allowed price keys: ${allowed.size}`);
    console.log(`  market:  ${m.before} → ${m.after} (${m.removed.length} removed)`);
    console.log(`  history: ${h.before} → ${h.after} (${h.removed.length} removed)`);
    console.log(
      `  trends:  ${trendsBefore} → ${trendKeyCount} (rebuilt from history${dryRun ? " — not written" : ""})`,
    );
    if (totalRemoved > 0) {
      const sample = [...m.removed, ...h.removed].slice(0, 12);
      console.log(`  sample removed keys: ${sample.join(", ")}${totalRemoved > 12 ? " …" : ""}`);
    }
  }

  console.log(dryRun ? "\nDry-run — no files written." : "\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
