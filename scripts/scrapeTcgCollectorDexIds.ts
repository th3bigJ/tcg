/**
 * Scrape dex IDs for me03 cards from Bulbapedia.
 *
 * 1. Fetches the Perfect Order set page to get all card wiki links
 * 2. Visits each card page to extract the National Pokédex number(s)
 * 3. Matches by card number and updates data/cards/me03.json
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeTcgCollectorDexIds.ts
 *   node --import tsx/esm scripts/scrapeTcgCollectorDexIds.ts --dry-run
 */

import fs from "fs";
import path from "path";
import type { CardJsonEntry } from "../lib/staticDataTypes";

const DRY_RUN = process.argv.includes("--dry-run");
const SET_URL = "https://bulbapedia.bulbagarden.net/wiki/Perfect_Order_(TCG)";
const BASE_URL = "https://bulbapedia.bulbagarden.net";
const CARDS_FILE = path.join(process.cwd(), "data/cards/me03.json");
const UA = "Mozilla/5.0 (compatible; TCG-DexScraper/1.0)";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Step 1: get all card wiki links from set page ──────────────────────────
  console.log("Fetching Perfect Order set page…");
  const setHtml = await fetchHtml(SET_URL);

  const linkMatches = [...setHtml.matchAll(/href="(\/wiki\/[^"]+Perfect_Order_(\d+)[^"]*?)"/g)];
  const seen = new Set<string>();
  const cardLinks: Array<{ href: string; cardNum: number }> = [];
  for (const m of linkMatches) {
    const href = m[1];
    const cardNum = parseInt(m[2], 10);
    if (!seen.has(href)) {
      seen.add(href);
      cardLinks.push({ href, cardNum });
    }
  }
  cardLinks.sort((a, b) => a.cardNum - b.cardNum);
  console.log(`Found ${cardLinks.length} card links\n`);

  // ── Step 2: visit each card page and extract dex IDs ──────────────────────
  /** cardNum → dex ids */
  const dexMap = new Map<number, number[]>();

  for (let i = 0; i < cardLinks.length; i++) {
    const { href, cardNum } = cardLinks[i];
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${cardLinks.length}] ${href.replace("/wiki/", "")} … `);

    try {
      const html = await fetchHtml(`${BASE_URL}${href}`);

      const dexNums: number[] = [];

      // Pattern 1: <div>0167</div> immediately after "No." label (standard Pokémon cards)
      const re1 = /No\.<\/span><\/a><\/div>\s*<div[^>]*>(\d{4})<\/div>/g;
      let m: RegExpExecArray | null;
      while ((m = re1.exec(html)) !== null) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > 0) dexNums.push(n);
      }

      // Pattern 2: HOME0718M.png image filenames (ex / special cards)
      if (dexNums.length === 0) {
        const re2 = /HOME(\d{4})/g;
        while ((m = re2.exec(html)) !== null) {
          const n = parseInt(m[1], 10);
          if (Number.isFinite(n) && n > 0) dexNums.push(n);
        }
      }

      const unique = [...new Set(dexNums)].sort((a, b) => a - b);
      if (unique.length > 0) {
        dexMap.set(cardNum, unique);
        console.log(`dex: ${unique.join(", ")}`);
      } else {
        console.log("no dex (trainer/energy)");
      }
    } catch (e) {
      console.log(`error: ${e instanceof Error ? e.message : "unknown"}`);
    }

    // Polite delay
    await sleep(300);
  }

  // ── Step 3: update the JSON file ──────────────────────────────────────────
  console.log(`\nMatched dex IDs for ${dexMap.size} cards`);

  const cards: CardJsonEntry[] = JSON.parse(fs.readFileSync(CARDS_FILE, "utf-8"));
  let updated = 0;
  let skipped = 0;

  for (const card of cards) {
    const localId = card.localId ? parseInt(card.localId, 10) : null;
    if (localId === null || !Number.isFinite(localId)) continue;

    const dexIds = dexMap.get(localId);
    if (dexIds) {
      card.dexIds = dexIds;
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`Updated: ${updated}, skipped (trainer/energy/no match): ${skipped}`);

  if (DRY_RUN) {
    console.log("(dry-run — not writing file)");
    console.log("Sample:", [...dexMap.entries()].slice(0, 5).map(([k, v]) => `card ${k} → dex ${v}`));
  } else {
    fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2));
    console.log(`Wrote ${CARDS_FILE}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
