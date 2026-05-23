/**
 * Seed or update Pokémon singles from a Scrydex expansion listing + card pages.
 * Writes `r2_backup/data/cards/{setKey}.json` and downloads images to `r2_backup/cards/`.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seedPokemonSetFromScrydex.ts --set=me4 --full
 *   npx tsx --env-file=.env.local scripts/seedPokemonSetFromScrydex.ts --set=mep
 *   npx tsx --env-file=.env.local scripts/seedPokemonSetFromScrydex.ts --set=me4,mep --dry-run
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  fetchScrydexExpansionMultiPageHtml,
  SCRYDEX_DEFAULT_UA,
} from "../nightly-scrape/scrydexExpansionListParsing.js";
import { fetchScrydexCardPageHtml } from "../nightly-scrape/scrydexMepCardPagePricing.js";
import { resolveExpansionConfigsForSet } from "../nightly-scrape/scrydexExpansionConfigsForSet.js";
import {
  isScrydexErrorPage,
  parseScrydexCardAbilities,
  parseScrydexCardAttacks,
  parseScrydexCardFlavorText,
  parseScrydexCardId,
  parseScrydexCardResistance,
  parseScrydexCardRetreatCost,
  parseScrydexCardRulesFromDetails,
  parseScrydexCardSubtype,
  parseScrydexCardWeakness,
  parseScrydexDevPaneField,
  parseScrydexPrintedNumber,
  parseScrydexSupertype,
} from "../nightly-scrape/scrydexCardPageCardText.js";
import type { CardJsonEntry, SetJsonEntry } from "../nightly-scrape/staticDataTypes.js";

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.join(REPO_ROOT, "..", "r2_backup", "data");
const CARDS_DIR = path.join(DATA_ROOT, "cards");
const IMAGES_DIR = path.join(REPO_ROOT, "..", "r2_backup", "cards");
const SETS_FILE = path.join(DATA_ROOT, "sets.json");
const SCRYDEX_BASE = "https://scrydex.com";
const SCRYDEX_IMAGE_BASE = "https://images.scrydex.com/pokemon";

const dryRun = process.argv.includes("--dry-run");
const fullReplace = process.argv.includes("--full");
const skipImages = process.argv.includes("--no-images");

const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  : undefined;

if (!onlySetCodes?.length) {
  console.error("Usage: --set=me4 or --set=me4,mep (add --full for a full re-seed, --dry-run, --no-images)");
  process.exit(1);
}

type ListingTile = {
  path: string;
  externalId: string;
  variant: string;
  displayNum: string;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function padPromoLocalId(setKey: string, num: string): string {
  if (setKey === "mep" && /^\d+$/u.test(num)) return num.padStart(3, "0");
  return num;
}

function imageFileStem(setKey: string, externalId: string, localId: string): string {
  const suffix = externalId.includes("-") ? externalId.slice(externalId.indexOf("-") + 1) : localId;
  if (setKey === "mep") return `${setKey}-${padPromoLocalId(setKey, suffix)}`;
  return `${setKey}-${suffix}`;
}

function parseExpansionListing(html: string, listPrefix: string): ListingTile[] {
  const escaped = escapeRegExp(listPrefix.trim());
  const pattern = new RegExp(
    `href="([^"]*\\/pokemon\\/cards\\/[^/]+\\/(${escaped}-[a-z0-9_]+))(\\?variant=([^"]+))?"[^>]*>[\\s\\S]*?<span class="text-body-12 text-white text-center">([^<]+?)\\s+#([^<]+)<\\/span>`,
    "giu",
  );
  const best = new Map<string, ListingTile & { score: number }>();

  for (const match of html.matchAll(pattern)) {
    const tilePath = match[1];
    const externalId = match[2].toLowerCase();
    const variant = (match[4] ?? "default").trim().toLowerCase();
    const cardName = stripTags(match[5]);
    const displayNum = stripTags(match[6]);
    void cardName;
    const score = variant === "holofoil" ? 3 : variant === "normal" ? 2 : variant === "default" ? 2 : 1;
    const prev = best.get(externalId);
    if (!prev || score > prev.score) {
      best.set(externalId, { path: tilePath, externalId, variant, displayNum, score });
    }
  }

  return [...best.values()].map(({ score: _s, ...t }) => t);
}

function nextMasterCardId(): number {
  const files = fs.existsSync(CARDS_DIR)
    ? fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"))
    : [];
  let max = 0;
  for (const file of files) {
    const cards = readJson<CardJsonEntry[]>(path.join(CARDS_DIR, file));
    for (const c of cards) {
      const n = Number.parseInt(c.masterCardId, 10);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return max + 1;
}

type TcgdexCard = {
  rarity?: string | null;
  category?: string;
  hp?: number | null;
  types?: string[];
  dexId?: number[];
  illustrator?: string | null;
  regulationMark?: string | null;
};

async function fetchTcgdexCard(setKey: string, externalId: string): Promise<TcgdexCard | null> {
  const suffix = externalId.includes("-") ? externalId.slice(externalId.indexOf("-") + 1) : externalId;
  const candidates = [`${setKey}-${suffix}`, externalId];
  for (const id of candidates) {
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${id}`);
      if (!res.ok) continue;
      const data = (await res.json()) as TcgdexCard;
      if (data && typeof data === "object") return data;
    } catch {
      /* optional */
    }
  }
  return null;
}

function parseDexIds(html: string): number[] | null {
  const raw = parseScrydexDevPaneField(html, "national_pokedex_numbers");
  if (!raw) return null;
  const nums = [...raw.matchAll(/\d+/g)].map((m) => Number.parseInt(m[0], 10)).filter(Number.isFinite);
  return nums.length ? nums : null;
}

function normalizeCategory(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === "Pokemon") return "Pokémon";
  return value;
}

function buildCardRow(
  set: SetJsonEntry,
  tile: ListingTile,
  html: string,
  masterCardId: number,
): CardJsonEntry {
  const setKey = set.setKey.trim();
  const externalId = parseScrydexCardId(html) ?? tile.externalId;
  const printed = parseScrydexPrintedNumber(html);
  const suffix = externalId.includes("-") ? externalId.slice(externalId.indexOf("-") + 1) : tile.displayNum;
  const localId = padPromoLocalId(setKey, suffix.replace(/^0+/, "") || suffix);
  const cardNumber = printed ?? tile.displayNum;
  const supertype = parseScrydexSupertype(html) ?? "Pokémon";
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+?)\s+#/i);
  const cardName =
    (ogTitle ? stripTags(ogTitle[1]) : null) ??
    parseScrydexDevPaneField(html, "name") ??
    parseScrydexDevPaneField(html, "pokemon") ??
    "Unknown";

  const stem = imageFileStem(setKey, externalId, localId);
  const imageLowSrc = `cards/${stem}-low.png`;
  const imageHighSrc = `cards/${stem}-high.png`;

  return {
    masterCardId: String(masterCardId),
    externalId,
    localId,
    setCode: setKey,
    cardNumber,
    cardName,
    fullDisplayName: `${cardName} ${cardNumber} ${set.name}`.trim(),
    rarity: parseScrydexDevPaneField(html, "rarity"),
    category: normalizeCategory(supertype),
    hp: (() => {
      const h = parseScrydexDevPaneField(html, "hp");
      return h ? Number.parseInt(h, 10) : null;
    })(),
    elementTypes: (() => {
      const t = parseScrydexDevPaneField(html, "types");
      return t ? t.split(",").map((x) => x.trim()).filter(Boolean) : null;
    })(),
    dexIds: parseDexIds(html),
    trainerType: supertype === "Trainer" ? parseScrydexCardSubtype(html) : null,
    energyType: supertype === "Energy" ? parseScrydexCardSubtype(html) : null,
    regulationMark: parseScrydexDevPaneField(html, "regulation_mark"),
    artist: parseScrydexDevPaneField(html, "artist"),
    imageLowSrc,
    imageHighSrc,
    attacks: (() => {
      const a = parseScrydexCardAttacks(html);
      return a.length ? a : null;
    })(),
    abilities: (() => {
      const a = parseScrydexCardAbilities(html);
      return a.length ? a : null;
    })(),
    rules: parseScrydexCardRulesFromDetails(html),
    subtype: parseScrydexCardSubtype(html),
    weakness: parseScrydexCardWeakness(html),
    resistance: parseScrydexCardResistance(html),
    retreatCost: parseScrydexCardRetreatCost(html),
    flavorText: parseScrydexCardFlavorText(html),
    pricingVariants: null,
  };
}

async function enrichWithTcgdex(card: CardJsonEntry): Promise<CardJsonEntry> {
  const tcgdex = await fetchTcgdexCard(card.setCode, card.externalId ?? "");
  if (!tcgdex) return card;
  return {
    ...card,
    rarity: tcgdex.rarity ?? card.rarity,
    category: normalizeCategory(tcgdex.category ?? card.category),
    hp: typeof tcgdex.hp === "number" ? tcgdex.hp : card.hp,
    elementTypes: tcgdex.types ?? card.elementTypes,
    dexIds: tcgdex.dexId ?? card.dexIds,
    regulationMark: tcgdex.regulationMark ?? card.regulationMark,
    artist: tcgdex.illustrator ?? card.artist,
  };
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  if (dryRun || skipImages) return;
  if (fs.existsSync(destPath)) return;
  const res = await fetch(url, {
    headers: { "User-Agent": SCRYDEX_DEFAULT_UA, Accept: "image/*,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
}

function scrydexImageUrl(externalId: string, size: "small" | "large"): string {
  return `${SCRYDEX_IMAGE_BASE}/${externalId}/${size}`;
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function seedSet(set: SetJsonEntry): Promise<void> {
  const setKey = set.setKey.trim();
  const configs = resolveExpansionConfigsForSet(set);
  if (!configs.length) {
    console.error(`[${setKey}] no Scrydex expansion mapping`);
    return;
  }

  const cardsPath = path.join(CARDS_DIR, `${setKey}.json`);
  const existing = fullReplace || !fs.existsSync(cardsPath) ? [] : readJson<CardJsonEntry[]>(cardsPath);
  const existingIds = new Set(existing.map((c) => (c.externalId ?? "").trim().toLowerCase()).filter(Boolean));

  let listing: ListingTile[] = [];
  for (const cfg of configs) {
    console.log(`[${setKey}] fetching ${cfg.expansionUrl}`);
    const html = await fetchScrydexExpansionMultiPageHtml(cfg.expansionUrl);
    const tiles = parseExpansionListing(html, cfg.listPrefix);
    console.log(`[${setKey}] ${tiles.length} tiles (${cfg.listPrefix})`);
    listing.push(...tiles);
  }

  const byExternal = new Map<string, ListingTile>();
  for (const t of listing) {
    if (!byExternal.has(t.externalId)) byExternal.set(t.externalId, t);
  }
  listing = [...byExternal.values()];

  const toProcess = fullReplace
    ? listing
    : listing.filter((t) => !existingIds.has(t.externalId));

  if (!toProcess.length) {
    console.log(`[${setKey}] nothing to add (${listing.length} on Scrydex, ${existing.length} local)`);
    return;
  }

  console.log(`[${setKey}] processing ${toProcess.length} card(s)…`);
  const masterStart = nextMasterCardId();
  const added: CardJsonEntry[] = new Array(toProcess.length);
  const concurrency = Number(process.env.SCRYDEX_SEED_CONCURRENCY ?? "6");

  await mapPool(toProcess, concurrency, async (tile, index) => {
    const url = `${SCRYDEX_BASE}${tile.path}?variant=${encodeURIComponent(tile.variant)}`;
    console.log(`[${setKey}] [${index + 1}/${toProcess.length}] ${tile.externalId}`);
    let html: string;
    try {
      html = await fetchScrydexCardPageHtml(tile.path, tile.variant);
    } catch {
      const res = await fetch(url, { headers: { "User-Agent": SCRYDEX_DEFAULT_UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      html = await res.text();
    }
    if (isScrydexErrorPage(html)) throw new Error(`Scrydex error page for ${tile.externalId}`);

    let card = buildCardRow(set, tile, html, masterStart + index);
    card = await enrichWithTcgdex(card);

    if (!dryRun) {
      const lowPath = path.join(IMAGES_DIR, path.basename(card.imageLowSrc));
      const highPath = path.join(IMAGES_DIR, path.basename(card.imageHighSrc));
      const extId = card.externalId ?? tile.externalId;
      await downloadImage(scrydexImageUrl(extId, "small"), lowPath);
      await downloadImage(scrydexImageUrl(extId, "large"), highPath);
    }

    added[index] = card;
  });

  const merged = fullReplace ? added : [...existing, ...added];
  merged.sort((a, b) => {
    const na = Number.parseInt(a.localId ?? "0", 10);
    const nb = Number.parseInt(b.localId ?? "0", 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return (a.externalId ?? "").localeCompare(b.externalId ?? "");
  });

  if (!dryRun) {
    writeJson(cardsPath, merged);
    set.cardCountTotal = listing.length;
    
    let masterSetTotal = 0;
    for (const card of merged) {
      const variantsCount = card.pricingVariants && card.pricingVariants.length > 0
        ? card.pricingVariants.length
        : 1;
      masterSetTotal += variantsCount;
    }
    set.masterSetTotal = masterSetTotal;

    console.log(`[${setKey}] wrote ${merged.length} cards → ${path.relative(REPO_ROOT, cardsPath)}`);
  } else {
    console.log(`[${setKey}] dry-run: would write ${merged.length} cards (${added.length} new)`);
  }
}

async function main(): Promise<void> {
  const sets = readJson<SetJsonEntry[]>(SETS_FILE);
  const targets = sets.filter((s) => onlySetCodes!.includes(s.setKey.trim().toLowerCase()));
  if (!targets.length) {
    throw new Error(`No sets in sets.json for: ${onlySetCodes!.join(", ")}`);
  }

  for (const set of targets) {
    await seedSet(set);
  }

  if (!dryRun) {
    writeJson(SETS_FILE, sets);
    console.log(`Updated ${path.relative(REPO_ROOT, SETS_FILE)}`);
  }

  console.log("\nDone. Upload with: npx tsx --env-file=.env.local scripts/upload-r2.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
