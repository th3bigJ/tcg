/**
 * Lists catalog cards whose externalId cannot be resolved in all three local mirrors:
 *   data/pricing/card-pricing, price-history, price-trends
 *
 * Uses `buildPricingLookupIds` so alternate spellings still resolve; pricing files should
 * use the exact catalog `externalId` as the key (case-sensitive).
 *
 * Usage: node --import tsx/esm scripts/reportSinglesPricingCompleteness.ts
 *          ... --limit=50   (max rows to print; default 100)
 *          ... --json       (full gap array to stdout)
 */

import fs from "fs";
import path from "path";
import { buildPricingLookupIds } from "../lib/r2Pricing";

const jsonOut = process.argv.includes("--json");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const printLimit = limitArg ? Math.max(0, Number.parseInt(limitArg.split("=")[1] ?? "100", 10)) : 100;

const DATA = path.join(process.cwd(), "data");
const setsPath = path.join(DATA, "sets.json");
const cardsDir = path.join(DATA, "cards");
const pricingRoot = path.join(DATA, "pricing");

function keySet(filePath: string): Set<string> | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return new Set();
  return new Set(Object.keys(JSON.parse(raw) as Record<string, unknown>));
}

/** True if the file contains this card under the exact id or any `buildPricingLookupIds` variant. */
function hasRow(set: Set<string> | null, externalId: string): boolean {
  if (!set || set.size === 0) return false;
  for (const id of buildPricingLookupIds(externalId)) {
    if (set.has(id)) return true;
  }
  return false;
}

type Gap = { setKey: string; externalId: string; cardName: string; missing: ("card-pricing" | "price-history" | "price-trends")[] };

function main(): void {
  const sets = JSON.parse(fs.readFileSync(setsPath, "utf-8")) as { setKey: string }[];
  const gaps: Gap[] = [];
  let totalCards = 0;
  let full = 0;

  for (const { setKey } of sets) {
    const cardPath = path.join(cardsDir, `${setKey}.json`);
    if (!fs.existsSync(cardPath)) continue;
    const cards = JSON.parse(fs.readFileSync(cardPath, "utf-8")) as {
      externalId: string | null;
      cardName: string;
    }[];

    const cp = keySet(path.join(pricingRoot, "card-pricing", `${setKey}.json`));
    const ph = keySet(path.join(pricingRoot, "price-history", `${setKey}.json`));
    const pt = keySet(path.join(pricingRoot, "price-trends", `${setKey}.json`));

    for (const c of cards) {
      const ext = (c.externalId ?? "").trim();
      if (!ext) continue;
      totalCards += 1;
      const missing: Gap["missing"] = [];
      if (!hasRow(cp, ext)) missing.push("card-pricing");
      if (!hasRow(ph, ext)) missing.push("price-history");
      if (!hasRow(pt, ext)) missing.push("price-trends");
      if (missing.length === 0) full += 1;
      else gaps.push({ setKey, externalId: ext, cardName: c.cardName, missing });
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify({ totalCards, full, gapCount: gaps.length, gaps }, null, 2));
    process.exit(gaps.length > 0 ? 1 : 0);
    return;
  }

  console.log(`Cards with non-empty externalId: ${totalCards}`);
  console.log(`Resolved in all 3 layers (with id aliases): ${full}`);
  console.log(`Missing ≥1 layer: ${gaps.length}`);

  const bySet = new Map<string, number>();
  for (const g of gaps) bySet.set(g.setKey, (bySet.get(g.setKey) ?? 0) + 1);
  const top = [...bySet.entries()].sort((a, b) => b[1] - a[1]);
  console.log("\nGaps per set:");
  for (const [k, n] of top) console.log(`  ${k}: ${n}`);

  if (printLimit > 0 && gaps.length) {
    console.log(`\nFirst ${Math.min(printLimit, gaps.length)} cards (setKey | externalId | missing):`);
    for (const g of gaps.slice(0, printLimit)) {
      console.log(`  ${g.setKey} | ${g.externalId} | ${g.missing.join(", ")}`);
    }
    if (gaps.length > printLimit) console.log(`  … ${gaps.length - printLimit} more (use --json or --limit=N)`);
  }

  process.exit(gaps.length > 0 ? 1 : 0);
}

main();
