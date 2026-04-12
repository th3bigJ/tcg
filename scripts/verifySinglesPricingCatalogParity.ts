/**
 * Compare `data/pokemon/cards/{setKey}.json` externalIds to keys in:
 *   data/pokemon/pricing/card-pricing, price-history, price-trends
 *
 * Usage:
 *   node --import tsx/esm scripts/verifySinglesPricingCatalogParity.ts
 *   node --import tsx/esm scripts/verifySinglesPricingCatalogParity.ts --json
 */

import fs from "fs";
import path from "path";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const jsonOut = process.argv.includes("--json");

const DATA = pokemonLocalDataRoot;
const setsPath = path.join(DATA, "sets.json");
const cardsDir = path.join(DATA, "cards");
const pricingRoot = path.join(DATA, "pricing");
const layers = ["card-pricing", "price-history", "price-trends"] as const;

function keySet(filePath: string): Set<string> | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8").trim();
  if (!raw) return new Set();
  return new Set(Object.keys(JSON.parse(raw) as Record<string, unknown>));
}

type Row = {
  setKey: string;
  cardsInFile: number;
  catalog: number;
  cp: number | null;
  ph: number | null;
  pt: number | null;
  miss: { cp: number; ph: number; pt: number };
  extra: { cp: number; ph: number; pt: number };
};

function main(): void {
  const sets = JSON.parse(fs.readFileSync(setsPath, "utf-8")) as { setKey: string }[];
  const setKeys = new Set(sets.map((s) => s.setKey));

  const rows: Row[] = [];
  let perfect = 0;

  for (const { setKey } of sets) {
    const cards = JSON.parse(
      fs.readFileSync(path.join(cardsDir, `${setKey}.json`), "utf-8"),
    ) as { externalId: string | null }[];
    const cardsInFile = cards.length;
    const catalog = new Set((cards.map((c) => c.externalId).filter(Boolean) as string[]).map((id) => id.trim()));

    const cp = keySet(path.join(pricingRoot, "card-pricing", `${setKey}.json`));
    const ph = keySet(path.join(pricingRoot, "price-history", `${setKey}.json`));
    const pt = keySet(path.join(pricingRoot, "price-trends", `${setKey}.json`));

    const miss = { cp: 0, ph: 0, pt: 0 };
    const extra = { cp: 0, ph: 0, pt: 0 };
    if (cp)
      for (const id of catalog) {
        if (!cp.has(id)) miss.cp += 1;
      }
    else miss.cp = catalog.size;
    if (ph)
      for (const id of catalog) {
        if (!ph.has(id)) miss.ph += 1;
      }
    else miss.ph = catalog.size;
    if (pt)
      for (const id of catalog) {
        if (!pt.has(id)) miss.pt += 1;
      }
    else miss.pt = catalog.size;

    if (cp) extra.cp = [...cp].filter((id) => !catalog.has(id)).length;
    if (ph) extra.ph = [...ph].filter((id) => !catalog.has(id)).length;
    if (pt) extra.pt = [...pt].filter((id) => !catalog.has(id)).length;

    const ok =
      cp &&
      ph &&
      pt &&
      cp.size === ph.size &&
      ph.size === pt.size &&
      pt.size === catalog.size &&
      miss.cp === 0 &&
      extra.cp === 0 &&
      extra.ph === 0 &&
      extra.pt === 0;

    if (ok) perfect += 1;
    else {
      rows.push({
        setKey,
        cardsInFile,
        catalog: catalog.size,
        cp: cp?.size ?? null,
        ph: ph?.size ?? null,
        pt: pt?.size ?? null,
        miss,
        extra,
      });
    }
  }

  const orphans: Record<string, string[]> = {};
  for (const L of layers) {
    orphans[L] = [];
    const dir = path.join(pricingRoot, L);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const base = f.replace(/\.json$/, "");
      if (!setKeys.has(base)) orphans[L].push(base);
    }
    orphans[L].sort();
  }

  const summary = {
    setCount: sets.length,
    perfectTripleParity: perfect,
    imperfectSets: rows.length,
    rows,
    orphans,
  };

  if (jsonOut) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `Catalog parity: ${perfect}/${sets.length} sets have identical keys in card-pricing, price-history, and price-trends (matching non-null card externalIds).`,
    );
    if (rows.length) {
      console.log(`\nSets without full parity (${rows.length}):`);
      for (const r of rows) {
        const parts: string[] = [];
        if (r.cp === null) parts.push("no card-pricing file");
        if (r.ph === null) parts.push("no price-history file");
        if (r.pt === null) parts.push("no price-trends file");
        if (r.miss.cp || r.miss.ph || r.miss.pt) {
          parts.push(
            `missing catalog ids: cp ${r.miss.cp} / ph ${r.miss.ph} / pt ${r.miss.pt}`,
          );
        }
        if (r.extra.cp || r.extra.ph || r.extra.pt) {
          parts.push(
            `extra non-catalog keys: cp ${r.extra.cp} / ph ${r.extra.ph} / pt ${r.extra.pt}`,
          );
        }
        const label =
          r.catalog === r.cardsInFile
            ? `${r.catalog} cards`
            : `${r.catalog} priced ids / ${r.cardsInFile} rows in cards JSON`;
        console.log(`  ${r.setKey} (${label}): ${parts.join("; ")}`);
      }
      console.log("\nRe-run with --json for full detail.");
    }
    for (const L of layers) {
      if (orphans[L].length) {
        console.log(`\nOrphan ${L} files (no setKey in sets.json): ${orphans[L].join(", ")}`);
      }
    }
  }

  // Orphan pricing files (e.g. alternate toolkit slugs) are reported but do not fail the run.
  process.exit(rows.length > 0 ? 1 : 0);
}

main();
