/**
 * Groups variant keys in `data/pokemon/pricing/card-pricing/*.json` by a compact form (lowercase, no spaces/_/-)
 * and prints groups where more than one distinct key maps to the same form — candidates for duplicate slugs.
 *
 * Usage: node --import tsx/esm scripts/reportPricingVariantKeyCollisions.ts
 */

import fs from "fs";
import path from "path";

import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const DATA = path.join(pokemonLocalDataRoot, "pricing", "card-pricing");

function compactGroupKey(variantKey: string): string {
  return variantKey.toLowerCase().replace(/[\s_-]/g, "");
}

function main(): void {
  if (!fs.existsSync(DATA)) {
    console.error(`Missing ${DATA}`);
    process.exit(1);
  }

  const globalMap = new Map<string, Set<string>>();

  for (const name of fs.readdirSync(DATA).filter((f) => f.endsWith(".json"))) {
    const raw = fs.readFileSync(path.join(DATA, name), "utf-8");
    const data = JSON.parse(raw) as Record<string, { scrydex?: Record<string, unknown> }>;

    for (const entry of Object.values(data)) {
      const sc = entry.scrydex;
      if (!sc || typeof sc !== "object") continue;
      for (const key of Object.keys(sc)) {
        const g = compactGroupKey(key);
        if (!globalMap.has(g)) globalMap.set(g, new Set());
        globalMap.get(g)!.add(key);
      }
    }
  }

  const collisions: { group: string; keys: string[] }[] = [];
  for (const [group, set] of globalMap) {
    if (set.size > 1) {
      collisions.push({ group, keys: [...set].sort((a, b) => a.localeCompare(b)) });
    }
  }
  collisions.sort((a, b) => a.group.localeCompare(b.group));

  console.log(`Variant key groups with multiple spellings (${collisions.length} groups):\n`);
  for (const c of collisions) {
    console.log(`  [${c.group}]`);
    for (const k of c.keys) console.log(`    - ${k}`);
    console.log("");
  }
}

main();
