/**
 * Merges run-on duplicate variant keys into canonical camelCase across
 * `data/pokemon/cards`, `data/pokemon/pricing/card-pricing`, `price-history`, `price-trends`.
 *
 * Pairs are defined in `lib/pricingVariantCompactAliases.ts` (`PRICING_VARIANT_RUN_ON_MIGRATIONS`).
 *
 * Usage:
 *   npm run migrate:pricing-variant-camelcase
 *   node --import tsx/esm scripts/migratePricingVariantKeysToCanonicalCamelCase.ts --dry-run
 */

import fs from "fs";
import path from "path";
import { PRICING_VARIANT_RUN_ON_MIGRATIONS } from "../lib/pricingVariantCompactAliases";
import type { CardPriceHistory, CardPriceTrendSummary, ScrydexVariantPricing } from "../lib/staticDataTypes";
import type { PriceHistoryPoint, PriceHistoryWindow } from "../lib/staticDataTypes";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const dryRun = process.argv.includes("--dry-run");
const DATA = pokemonLocalDataRoot;

function mergeScrydexVariant(
  bad: ScrydexVariantPricing,
  good: ScrydexVariantPricing | undefined,
): ScrydexVariantPricing {
  const merged: ScrydexVariantPricing = { ...(good ?? {}) };
  for (const k of ["raw", "psa10", "ace10"] as const) {
    const a = bad[k];
    const b = merged[k];
    if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b)) {
      merged[k] = Math.max(a, b);
    } else if (a != null && Number.isFinite(a)) {
      merged[k] = a;
    }
  }
  return merged;
}

function mergePointArrays(primary: PriceHistoryPoint[], secondary: PriceHistoryPoint[]): PriceHistoryPoint[] {
  const byKey = new Map<string, number>();
  for (const [k, v] of primary) {
    if (typeof v === "number" && Number.isFinite(v)) byKey.set(k, v);
  }
  for (const [k, v] of secondary) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (!byKey.has(k)) byKey.set(k, v);
  }
  return [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function mergeGradeHistories(
  good: Record<string, PriceHistoryWindow> | undefined,
  bad: Record<string, PriceHistoryWindow>,
): Record<string, PriceHistoryWindow> {
  const out: Record<string, PriceHistoryWindow> = good ? { ...good } : {};
  for (const [grade, badWin] of Object.entries(bad)) {
    const gWin = out[grade];
    if (!gWin) {
      out[grade] = badWin;
      continue;
    }
    out[grade] = {
      daily: mergePointArrays(gWin.daily ?? [], badWin.daily ?? []),
      weekly: mergePointArrays(gWin.weekly ?? [], badWin.weekly ?? []),
      monthly: mergePointArrays(gWin.monthly ?? [], badWin.monthly ?? []),
    };
  }
  return out;
}

function mergeTrendGradeMaps(
  good: Record<string, unknown> | undefined,
  bad: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = good ? { ...good } : {};
  for (const [grade, summary] of Object.entries(bad)) {
    if (!(grade in out)) out[grade] = summary;
  }
  return out;
}

function migrateCardPricingEntry(
  entry: { scrydex?: Record<string, ScrydexVariantPricing>; tcgplayer?: unknown },
  { bad, good }: { bad: string; good: string },
): boolean {
  let changed = false;
  if (entry.scrydex && typeof entry.scrydex === "object" && bad in entry.scrydex) {
    const b = entry.scrydex[bad] as ScrydexVariantPricing;
    const prev = entry.scrydex[good];
    entry.scrydex[good] = mergeScrydexVariant(b, prev);
    delete entry.scrydex[bad];
    changed = true;
  }
  if (entry.tcgplayer && typeof entry.tcgplayer === "object") {
    const tp = entry.tcgplayer as Record<string, unknown>;
    if (bad in tp) {
      const badBlock = tp[bad];
      const goodBlock = tp[good];
      if (goodBlock && typeof goodBlock === "object" && badBlock && typeof badBlock === "object") {
        const b = badBlock as Record<string, unknown>;
        const g = goodBlock as Record<string, unknown>;
        for (const k of Object.keys(b)) {
          if (g[k] === undefined) g[k] = b[k];
        }
      } else if (!goodBlock && badBlock) {
        tp[good] = badBlock;
      }
      delete tp[bad];
      changed = true;
    }
  }
  return changed;
}

function migrateCardPricingFile(filePath: string): boolean {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as Record<string, { scrydex?: Record<string, ScrydexVariantPricing>; tcgplayer?: unknown }>;
  let changed = false;

  for (const entry of Object.values(data)) {
    for (const pair of PRICING_VARIANT_RUN_ON_MIGRATIONS) {
      if (migrateCardPricingEntry(entry, pair)) changed = true;
    }
  }

  if (changed && !dryRun) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`, "utf-8");
  }
  return changed;
}

function migratePriceHistoryFile(filePath: string): boolean {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as Record<string, CardPriceHistory>;
  let changed = false;

  for (const cardHistory of Object.values(data)) {
    if (!cardHistory || typeof cardHistory !== "object") continue;
    for (const { bad, good } of PRICING_VARIANT_RUN_ON_MIGRATIONS) {
      if (!(bad in cardHistory)) continue;
      const badH = cardHistory[bad] as Record<string, PriceHistoryWindow>;
      const goodH = cardHistory[good] as Record<string, PriceHistoryWindow> | undefined;
      cardHistory[good] = mergeGradeHistories(goodH, badH);
      delete cardHistory[bad];
      changed = true;
    }
  }

  if (changed && !dryRun) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`, "utf-8");
  }
  return changed;
}

function migratePriceTrendsFile(filePath: string): boolean {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as Record<string, CardPriceTrendSummary>;
  let changed = false;

  for (const summary of Object.values(data)) {
    if (!summary || typeof summary !== "object") continue;
    for (const { bad, good } of PRICING_VARIANT_RUN_ON_MIGRATIONS) {
      if (summary.variant === bad) {
        summary.variant = good;
        changed = true;
      }
      if (summary.allVariants && typeof summary.allVariants === "object" && bad in summary.allVariants) {
        const badGrades = summary.allVariants[bad] as Record<string, unknown>;
        const goodGrades = summary.allVariants[good] as Record<string, unknown> | undefined;
        summary.allVariants[good] = mergeTrendGradeMaps(goodGrades, badGrades);
        delete summary.allVariants[bad];
        changed = true;
      }
    }
  }

  if (changed && !dryRun) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 4)}\n`, "utf-8");
  }
  return changed;
}

function migrateCardsFile(filePath: string): boolean {
  const raw = fs.readFileSync(filePath, "utf-8");
  const rows = JSON.parse(raw) as { pricingVariants?: string[] | null }[];
  let changed = false;

  for (const card of rows) {
    const pv = card.pricingVariants;
    if (!pv || !Array.isArray(pv)) continue;
    let next = [...new Set(pv)];
    let touched = false;
    for (const { bad, good } of PRICING_VARIANT_RUN_ON_MIGRATIONS) {
      if (!next.includes(bad)) continue;
      next = next.filter((k) => k !== bad);
      if (!next.includes(good)) next.push(good);
      touched = true;
    }
    if (touched) {
      next.sort((a, b) => a.localeCompare(b));
      card.pricingVariants = next.length ? next : null;
      changed = true;
    }
  }

  if (changed && !dryRun) {
    fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 4)}\n`, "utf-8");
  }
  return changed;
}

function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
}

function main(): void {
  const layers = [
    { name: "card-pricing", dir: path.join(DATA, "pricing", "card-pricing"), fn: migrateCardPricingFile },
    { name: "price-history", dir: path.join(DATA, "pricing", "price-history"), fn: migratePriceHistoryFile },
    { name: "price-trends", dir: path.join(DATA, "pricing", "price-trends"), fn: migratePriceTrendsFile },
    { name: "cards", dir: path.join(DATA, "cards"), fn: migrateCardsFile },
  ] as const;

  let total = 0;
  for (const layer of layers) {
    const files = listJson(layer.dir);
    for (const f of files) {
      const abs = path.join(layer.dir, f);
      if (layer.fn(abs)) {
        console.log(`${dryRun ? "[dry-run would update] " : ""}${layer.name}/${f}`);
        total += 1;
      }
    }
  }

  console.log(`\n${dryRun ? "Would update" : "Updated"} ${total} file(s).`);
  if (dryRun) console.log("Re-run without --dry-run to write.");
}

main();
