/**
 * One Piece daily pricing used to treat `mangaAltArt` / `specialAltArt` as matching `altArt`
 * when Scrydex had no Raw chart slug for those prints — history then duplicated alt prices.
 *
 * This script removes daily points on suspect keys where the same calendar day on the sibling
 * `altArt` row (same setCode + cardNumber) has an equal NM price (within epsilon), then
 * rebuilds weekly/monthly from the remaining dailies and refreshes trends.
 *
 * Does not touch market JSON — run the pricing scraper after to refresh spot prices if needed.
 *
 * Usage:
 *   node --import tsx/esm scripts/fixOnePieceHistorySuspectAltArtDupes.ts --dry-run
 *   node --import tsx/esm scripts/fixOnePieceHistorySuspectAltArtDupes.ts --set=OP09
 *   node --import tsx/esm scripts/fixOnePieceHistorySuspectAltArtDupes.ts
 */

import fs from "fs";
import { buildTrendMapFromHistoryMap } from "../lib/r2PriceTrends";
import type { CardPriceHistory, PriceHistoryPoint, SetPriceHistoryMap } from "../lib/staticDataTypes";
import {
  buildRawHistoryWindow,
  ensureOnePiecePricingDirs,
  historyFilePathForSet,
  loadOnePieceCardsForSet,
  loadOnePieceSets,
  priceKeyForOnePieceCard,
  trendsFilePathForSet,
  type OnePieceCardEntry,
} from "../lib/onepiecePricing";

const dryRun = process.argv.includes("--dry-run");
const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  : null;

const SUSPECT_VARIANTS = new Set(["mangaAltArt", "specialAltArt"]);
const EPS = 0.015;

function isPoint(v: unknown): v is PriceHistoryPoint {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "string" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[1])
  );
}

function cardGroupKey(c: OnePieceCardEntry): string {
  return `${c.setCode.trim().toUpperCase()}::${c.cardNumber.trim().toUpperCase()}`;
}

function readHistory(path: string): SetPriceHistoryMap {
  if (!fs.existsSync(path)) return {};
  try {
    return JSON.parse(fs.readFileSync(path, "utf8")) as SetPriceHistoryMap;
  } catch {
    return {};
  }
}

function dailyFromCardHistory(entry: CardPriceHistory | undefined): PriceHistoryPoint[] {
  const daily = entry?.default?.raw?.daily;
  if (!Array.isArray(daily)) return [];
  return daily.filter(isPoint);
}

function pruneSuspectDaily(
  suspectDaily: PriceHistoryPoint[],
  altDaily: PriceHistoryPoint[],
): { kept: PriceHistoryPoint[]; removed: number } {
  const altByDate = new Map<string, number>();
  for (const [d, p] of altDaily) {
    altByDate.set(d, p);
  }
  let removed = 0;
  const kept: PriceHistoryPoint[] = [];
  for (const [d, p] of suspectDaily) {
    const altP = altByDate.get(d);
    if (altP !== undefined && Math.abs(altP - p) <= EPS) {
      removed += 1;
      continue;
    }
    kept.push([d, p]);
  }
  return { kept, removed };
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

  console.log(`=== Fix suspect One Piece history duped from altArt (${dryRun ? "dry-run" : "live"}) ===\n`);

  for (const set of sets) {
    const cards = loadOnePieceCardsForSet(set.setCode);
    if (!cards.length) {
      console.log(`[${set.setCode}] skip — no cards JSON`);
      continue;
    }

    const byGroup = new Map<string, OnePieceCardEntry[]>();
    for (const c of cards) {
      const k = cardGroupKey(c);
      const arr = byGroup.get(k) ?? [];
      arr.push(c);
      byGroup.set(k, arr);
    }

    const historyPath = historyFilePathForSet(set.setCode);
    const trendsPath = trendsFilePathForSet(set.setCode);
    const historyMap = readHistory(historyPath);
    let totalRemoved = 0;
    let keysTouched = 0;

    for (const group of byGroup.values()) {
      const alt = group.find((c) => c.variant === "altArt");
      if (!alt) continue;
      const altKey = priceKeyForOnePieceCard(alt);
      const altEntry = historyMap[altKey];
      const altDaily = dailyFromCardHistory(altEntry);

      for (const card of group) {
        if (!SUSPECT_VARIANTS.has(card.variant)) continue;
        const suspectKey = priceKeyForOnePieceCard(card);
        const suspectEntry = historyMap[suspectKey];
        const suspectDaily = dailyFromCardHistory(suspectEntry);
        if (suspectDaily.length === 0) continue;

        const { kept, removed } = pruneSuspectDaily(suspectDaily, altDaily);
        if (removed === 0) continue;

        totalRemoved += removed;
        keysTouched += 1;

        if (dryRun) {
          console.log(`[${set.setCode}] ${suspectKey}: would remove ${removed}/${suspectDaily.length} daily points (dup altArt)`);
          continue;
        }

        const rebuilt = buildRawHistoryWindow(kept);
        if (!rebuilt) {
          delete historyMap[suspectKey];
        } else {
          historyMap[suspectKey] = rebuilt;
        }
      }
    }

    if (keysTouched === 0) {
      console.log(`[${set.setCode}] OK — no suspect daily rows matched altArt dupes`);
      continue;
    }

    if (!dryRun) {
      fs.writeFileSync(historyPath, JSON.stringify(historyMap, null, 2) + "\n");
      const trendMap = buildTrendMapFromHistoryMap(historyMap);
      fs.writeFileSync(trendsPath, JSON.stringify(trendMap, null, 2) + "\n");
    }

    console.log(
      `[${set.setCode}] ${keysTouched} price keys adjusted; ${totalRemoved} daily points ${dryRun ? "(dry-run)" : "removed"}`,
    );
  }

  console.log(dryRun ? "\nDry-run — no files written." : "\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
