/**
 * Rewrite `data/pricing/price-history/*.json` so Scarlet & Violet card keys use canonical
 * catalog prefixes (`sv2-…` not `sv02-…`, `sv6pt5-…` not `sv06.5-…`, etc.).
 *
 * When both legacy and canonical keys exist for the same card, keeps the canonical entry.
 *
 * Usage:
 *   node --import tsx/esm scripts/dedupeSinglesPriceHistorySvPrefixes.ts
 *   node --import tsx/esm scripts/dedupeSinglesPriceHistorySvPrefixes.ts --dry-run
 */

import fs from "fs";
import path from "path";
import {
  partitionPokemonCardExternalId,
  SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES,
} from "../lib/scrydexScarletVioletUrls";
import type { SetPriceHistoryMap } from "../lib/staticDataTypes";

const dryRun = process.argv.includes("--dry-run");

const DIR = path.join(process.cwd(), "data", "pricing", "price-history");

/** Match catalog `externalId` numbering (`sv6pt5-99` not `sv6pt5-099`). */
function normalizeHistoryCardSuffix(suffix: string): string {
  if (/^\d+$/u.test(suffix)) {
    const n = Number.parseInt(suffix, 10);
    return Number.isFinite(n) ? String(n) : suffix;
  }
  return suffix;
}

function isLegacyAliasPrefix(lowerPrefix: string): boolean {
  const mapped = SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES[lowerPrefix];
  return mapped !== undefined && mapped !== lowerPrefix;
}

/** Prefer catalog-style ids (`me2-1`) over zero-padded duplicates (`me2-001`) when merging. */
function numericSuffixMergeRank(key: string): number {
  const { suffix } = partitionPokemonCardExternalId(key);
  if (!/^\d+$/u.test(suffix)) return 0;
  const compact = String(Number.parseInt(suffix, 10));
  return suffix === compact ? 1 : 0;
}

function normalizedCardKey(key: string): string {
  const { prefix, suffix } = partitionPokemonCardExternalId(key);
  if (!suffix) return key;
  const lower = prefix.toLowerCase();
  const canon = SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES[lower] ?? lower;
  return `${canon}-${normalizeHistoryCardSuffix(suffix)}`;
}

function dedupeMap(data: SetPriceHistoryMap): { next: SetPriceHistoryMap; removed: number } {
  const out: SetPriceHistoryMap = {};
  let removed = 0;

  const entries = Object.entries(data);
  entries.sort(([a], [b]) => {
    const na = normalizedCardKey(a);
    const nb = normalizedCardKey(b);
    if (na !== nb) return na.localeCompare(nb);
    return numericSuffixMergeRank(a) - numericSuffixMergeRank(b);
  });

  for (const [k, v] of entries) {
    const { prefix: rawPrefix } = partitionPokemonCardExternalId(k);
    const fromLegacy = isLegacyAliasPrefix(rawPrefix.toLowerCase());
    const nk = normalizedCardKey(k);

    if (!(nk in out)) {
      out[nk] = v;
      continue;
    }

    if (fromLegacy) {
      removed += 1;
      continue;
    }

    out[nk] = v;
    removed += 1;
  }

  return { next: out, removed };
}

function main(): void {
  const names = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  let filesTouched = 0;
  let totalRemoved = 0;

  for (const name of names) {
    const filePath = path.join(DIR, name);
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) continue;

    const data = JSON.parse(raw) as SetPriceHistoryMap;
    const beforeKeys = Object.keys(data).length;
    const { next, removed } = dedupeMap(data);
    const afterKeys = Object.keys(next).length;

    if (removed === 0 && beforeKeys === afterKeys) continue;

    filesTouched += 1;
    totalRemoved += removed;
    console.log(
      `${name}: keys ${beforeKeys} → ${afterKeys} (dropped ${removed} duplicate/legacy rows)`,
    );

    if (!dryRun) {
      fs.writeFileSync(filePath, `${JSON.stringify(next)}\n`, "utf-8");
    }
  }

  console.log(
    dryRun
      ? `[dry-run] Would update ${filesTouched} file(s); ${totalRemoved} rows would be dropped.`
      : `Updated ${filesTouched} file(s); dropped ${totalRemoved} duplicate/legacy rows.`,
  );
}

main();
