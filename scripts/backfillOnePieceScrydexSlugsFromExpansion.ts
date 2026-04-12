/**
 * Fetches a One Piece expansion page from Scrydex and sets `scrydexSlug` on each
 * card in onepiece/cards/data/{setCode}.json. Required for daily pricing:
 * `jobScrapeOnePiecePricing` only reads prices when `scrydexSlug` is set.
 *
 * Regex must stay in sync with `parseScrydexExpansionCards` in scrapeOnePieceCards.ts.
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillOnePieceScrydexSlugsFromExpansion.ts --set=OP15
 */

import fs from "fs";
import path from "path";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const UA = "Mozilla/5.0 (compatible; tcg-backfill/1.0)";

type SetRow = {
  setCode: string;
  scrydexId: string | null;
};

function parseExpansionSlugMap(html: string): Map<string, string> {
  // Same pattern as scripts/scrapeOnePieceCards.ts → parseScrydexExpansionCards
  const re =
    /href="\/onepiece\/cards\/([^/"]+)\/(OP\d{2}-\d+|ST\d{2}-\d+|EB\d{2}-\d+|PRB\d+-\d+|P-\d+)\?variant=([^"]+)"/gi;
  const best = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1].trim();
    const cardNumber = m[2].trim().toUpperCase();
    if (!best.has(cardNumber)) best.set(cardNumber, slug);
  }
  // Cards that exist on Scrydex but are not linked from this expansion’s card grid (e.g. reprints).
  const manual: Record<string, string> = {
    "PRB02-014": "the-best-vol-2",
  };
  for (const [num, slug] of Object.entries(manual)) {
    best.set(num, slug);
  }
  return best;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith("--set="));
  const setCode = arg?.slice("--set=".length).trim().toUpperCase();
  if (!setCode) {
    console.error("Usage: --set=OP15");
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const setsPath = path.join(repoRoot, "onepiece", "sets", "data", "sets.json");
  const cardsPath = path.join(repoRoot, "onepiece", "cards", "data", `${setCode}.json`);

  const sets = JSON.parse(fs.readFileSync(setsPath, "utf8")) as SetRow[];
  const row = sets.find((s) => s.setCode.toUpperCase() === setCode);
  if (!row?.scrydexId) {
    console.error(`No scrydexId for ${setCode} in sets.json`);
    process.exit(1);
  }

  const expansionUrl = `https://scrydex.com/onepiece/expansions/${row.scrydexId}/${setCode}`;
  console.log(`Fetching ${expansionUrl}`);
  const html = await fetchText(expansionUrl);
  const slugByNumber = parseExpansionSlugMap(html);
  console.log(`Parsed ${slugByNumber.size} unique collector numbers from expansion page`);

  const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8")) as Array<{ cardNumber: string; scrydexSlug?: string | null }>;

  let filled = 0;
  let already = 0;
  const missing = new Set<string>();

  for (const c of cards) {
    const num = c.cardNumber.trim().toUpperCase();
    const slug = slugByNumber.get(num);
    if (slug) {
      if (c.scrydexSlug?.trim() === slug) already++;
      else filled++;
      c.scrydexSlug = slug;
    } else {
      missing.add(num);
    }
  }

  if (missing.size > 0) {
    console.warn(`Warning: ${missing.size} collector number(s) had no slug on the expansion page (check reprints or typos):`);
    console.warn([...missing].sort().slice(0, 30).join(", ") + (missing.size > 30 ? " …" : ""));
  }

  fs.writeFileSync(cardsPath, JSON.stringify(cards, null, 2) + "\n");
  console.log(`Wrote ${cardsPath} (${filled} updated, ${already} unchanged, ${cards.length} total)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
