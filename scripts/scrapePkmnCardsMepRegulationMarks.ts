/**
 * Scrape regulation marks for MEP (Mega Evolution Promos) from PkmnCards set listing + card pages.
 *
 * Set: https://pkmncards.com/set/mega-evolution-promos/
 * Card pages include e.g. `Mark: <a …>I</a>` (see `span.Regulation Mark`).
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapePkmnCardsMepRegulationMarks.ts --dry-run
 */

import fs from "fs";
import path from "path";
import type { CardJsonEntry } from "../lib/staticDataTypes";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const DRY_RUN = process.argv.includes("--dry-run");

const SET_URL = "https://pkmncards.com/set/mega-evolution-promos/";
const CARDS_FILE = path.join(pokemonLocalDataRoot, "cards", "mep.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

/** Extract card page URLs from the set archive HTML (absolute + relative). */
function extractCardUrlsFromSetPage(html: string): string[] {
  const urls = new Set<string>();
  const base = "https://pkmncards.com";

  const abs = html.match(/https:\/\/pkmncards\.com\/card\/[^"'>\s]+/gu) ?? [];
  for (const raw of abs) {
    const u = raw.replace(/\/+$/, "");
    if (/-mep-\d+(?:-\d+)?$/iu.test(u) || /mega-evolution-promos-mep-\d+/iu.test(u)) {
      urls.add(u);
    }
  }

  const rel = html.matchAll(/href="(\/card\/[^"?#]+)"/gu);
  for (const m of rel) {
    const path = m[1].replace(/\/+$/, "");
    if (!/-mep-\d+(?:-\d+)?$/iu.test(path)) continue;
    urls.add(`${base}${path}`);
  }

  return [...urls].sort((a, b) => a.localeCompare(b));
}

/**
 * Promo index from the URL slug, e.g. `…-mep-070` → 70, `…-mep-013-2` → 13 (alt art / second print).
 */
function mepNumberFromCardUrl(url: string): number | null {
  const m = url.match(/-mep-(\d+)(?:-\d+)?$/iu);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function canonicalMepExternalId(num: number): string {
  return `mep-${num}`;
}

/** Primary markup: `<span class="Regulation Mark">Mark: <a …>I</a></span>` */
function extractRegulationMark(html: string): string | null {
  const m1 = html.match(/class="Regulation Mark">Mark:\s*<a[^>]*>([^<]+)<\/a>/iu);
  if (m1?.[1]) return m1[1].trim();
  const m2 = html.match(/Mark:\s*<a[^>]*href="[^"]*regulation-mark[^"]*"[^>]*>([^<]+)<\/a>/iu);
  if (m2?.[1]) return m2[1].trim();
  return null;
}

function isMissingMark(card: CardJsonEntry): boolean {
  const v = card.regulationMark;
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

async function main() {
  console.log("Fetching set page…", SET_URL);
  const setHtml = await fetchHtml(SET_URL);
  const cardUrls = extractCardUrlsFromSetPage(setHtml);
  console.log(`Found ${cardUrls.length} card URLs\n`);

  /** `mep-1` → mark letter */
  const byCanonicalId = new Map<string, string>();

  for (let i = 0; i < cardUrls.length; i++) {
    const url = cardUrls[i];
    const num = mepNumberFromCardUrl(url);
    if (num === null) {
      console.warn("Skip (no mep number):", url);
      continue;
    }
    const key = canonicalMepExternalId(num);
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${cardUrls.length}] ${key} … `);
    try {
      const html = await fetchHtml(url.endsWith("/") ? url : `${url}/`);
      const mark = extractRegulationMark(html);
      if (mark) {
        byCanonicalId.set(key, mark.toUpperCase());
        console.log(mark);
      } else {
        console.log("no mark in HTML");
      }
    } catch (e) {
      console.log(`error: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(250);
  }

  console.log(`\nParsed marks for ${byCanonicalId.size} cards`);

  const cards: CardJsonEntry[] = JSON.parse(fs.readFileSync(CARDS_FILE, "utf8"));
  let updated = 0;
  let skippedNoExt = 0;
  let skippedHasMark = 0;
  let noScrape = 0;

  for (const card of cards) {
    if (!isMissingMark(card)) {
      skippedHasMark++;
      continue;
    }
    const ext = card.externalId?.trim();
    if (!ext?.startsWith("mep-")) {
      skippedNoExt++;
      continue;
    }
    const n = parseInt(ext.slice(4), 10);
    if (!Number.isFinite(n)) {
      skippedNoExt++;
      continue;
    }
    const key = canonicalMepExternalId(n);
    const mark = byCanonicalId.get(key);
    if (!mark) {
      noScrape++;
      continue;
    }
    if (!DRY_RUN) {
      card.regulationMark = mark;
    }
    updated++;
  }

  if (!DRY_RUN && updated > 0) {
    fs.writeFileSync(CARDS_FILE, `${JSON.stringify(cards, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      { dryRun: DRY_RUN, updated, skippedHasMark, skippedNoExt, noScrape, wrote: !DRY_RUN && updated > 0 },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
