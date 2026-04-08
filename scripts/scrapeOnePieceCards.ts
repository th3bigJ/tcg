/**
 * Scrape One Piece TCG card data from TCGPlayer (primary) and Scrydex (images).
 *
 * For each set in onepiece/sets/data/sets.json:
 *   1. Paginate TCGPlayer search API by setId → exact card metadata + productId per variant
 *   2. Fetch Scrydex expansion page → variant→imageUrl mapping
 *   3. Merge and write onepiece/cards/data/{setCode}.json
 *   4. Download card images to onepiece/cards/images/{setCode}/
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeOnePieceCards.ts
 *   node --import tsx/esm scripts/scrapeOnePieceCards.ts --set=OP01
 *   node --import tsx/esm scripts/scrapeOnePieceCards.ts --set=OP01,OP02
 *   node --import tsx/esm scripts/scrapeOnePieceCards.ts --dry-run
 *   node --import tsx/esm scripts/scrapeOnePieceCards.ts --no-images
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import type { RequestOptions } from "https";
import type { S3Client } from "@aws-sdk/client-s3";
import { buildOnePieceS3Client, uploadLocalFileToOnePieceR2 } from "../lib/onepieceR2";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

const DRY_RUN = process.argv.includes("--dry-run");
const NO_IMAGES = process.argv.includes("--no-images");
loadEnvFilesFromRepoRoot(import.meta.url);

const setArg = process.argv.find((a) => a.startsWith("--set="));
const ONLY_SETS = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim().toUpperCase())
  : null;

const REPO_ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const SETS_FILE = path.join(REPO_ROOT, "onepiece", "sets", "data", "sets.json");
const CARDS_DATA_DIR = path.join(REPO_ROOT, "onepiece", "cards", "data");
const CARDS_IMAGES_DIR = path.join(REPO_ROOT, "onepiece", "cards", "images");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TCG_SEARCH_URL =
  "https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false";

const TCG_IMAGE_URL = (productId: string) =>
  `https://product-images.tcgplayer.com/fit-in/437x437/${productId}.jpg`;

/**
 * TCGPlayer uses a different card number prefix than the canonical set code for some groups.
 * Key = TCGPlayer group's setCode, value = prefix remap to apply to all items in that group.
 * e.g. EB04 group uses ST29-xxx numbering → remap to EB04-xxx.
 */
const CARD_NUMBER_REMAP: Record<string, { from: string; to: string }> = {
  EB04: { from: "ST29", to: "EB04" },
};

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type OnePieceSetEntry = {
  setCode: string;
  name: string;
  tcgplayerId: string | null;
  tcgplayerUrlSlug: string | null;
  scrydexId: string | null;
  setType: string | null;
};

export type OnePieceCardVariant =
  | "normal"
  | "parallel"
  | "altArt"
  | "mangaAltArt"
  | "boxTopper"
  | "promo"
  | "specialAltArt";

export type OnePieceCard = {
  /** TCGPlayer productId — used for pricing */
  tcgplayerProductId: string;
  /** Canonical card number e.g. OP01-001 */
  cardNumber: string;
  /** Card name without variant suffix */
  name: string;
  setCode: string;
  /** Variant type */
  variant: OnePieceCardVariant;
  rarity: string | null;
  /** Leader / Character / Event / Stage / DON!! */
  cardType: string[] | null;
  color: string[] | null;
  cost: number | null;
  power: number | null;
  counter: number | null;
  /** Leaders only */
  life: number | null;
  attribute: string[] | null;
  subtypes: string[] | null;
  effect: string | null;
  /** Scrydex card slug e.g. "roronoa-zoro" — used for card page URL */
  scrydexSlug: string | null;
  /** Scrydex image URL */
  imageUrl: string | null;
  /** Local path after download */
  imagePath: string | null;
};

type TcgSearchResult = {
  totalResults: number | null;
  results: TcgCardItem[];
};

type TcgCardItem = {
  productId: number | null;
  productName: string;
  rarityName: string | null;
  foilOnly: boolean;
  setId: number | null;
  setName: string | null;
  customAttributes: {
    number: string | null;
    cardType: string[] | null;
    color: string[] | null;
    cost: string | null;
    power: string | null;
    counter: string | null;
    life: string | null;
    attribute: string[] | null;
    subtypes: string[] | null;
    description: string | null;
    releaseDate: string | null;
  } | null;
};

type ScrydexCardLink = {
  slug: string;
  cardId: string; // e.g. OP01-001
  variant: string; // raw scrydex variant name
  imageUrl: string;
};

// ──────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ──────────────────────────────────────────────────────────────────────────────

function postJson(url: string, body: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": UA,
          "Content-Length": Buffer.byteLength(body),
        },
      } as RequestOptions,
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (e) {
            reject(e);
          }
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, { headers: { "User-Agent": UA } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(res.headers.location as string).then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, { headers: { "User-Agent": UA } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location as string, destPath).then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve()));
      out.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanupPartialFile(destPath: string): void {
  if (fs.existsSync(destPath)) {
    fs.unlinkSync(destPath);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// TCGPlayer fetch
// ──────────────────────────────────────────────────────────────────────────────

async function fetchTcgPlayerCards(set: OnePieceSetEntry): Promise<TcgCardItem[]> {
  const all: TcgCardItem[] = [];
  let from = 0;
  const size = 50;
  let total: number | null = null;

  if (!set.tcgplayerId) return [];

  // Filter by numeric setId — avoids false matches on setName (e.g. "Straw Hat Crew" is also a subtype)
  const setId = Number(set.tcgplayerId);

  while (total === null || from < total) {
    const body = JSON.stringify({
      algorithm: "revenue_desc",
      from,
      size,
      filters: {
        term: { productLineName: ["One Piece Card Game"], setId: [setId] },
        range: {},
        match: {},
      },
      context: { shippingCountry: "US", cart: {} },
      settings: { useFuzzySearch: false, didYouMean: {} },
    });

    let data: unknown;
    try {
      data = await postJson(TCG_SEARCH_URL, body);
    } catch (err) {
      console.warn(`    [TCGPlayer] Request failed at offset ${from}, retrying...`);
      await sleep(2000);
      data = await postJson(TCG_SEARCH_URL, body);
    }

    const result = (data as { results?: Array<{ totalResults?: number; results?: TcgCardItem[] }> })
      ?.results?.[0];

    if (!result) break;

    const items = result.results ?? [];
    if (total === null) total = result.totalResults ?? items.length;

    // Validate set name match — filter out wrong-set results
    const validItems = items.filter((item) => {
      const ca = item.customAttributes;
      // Keep sealed products (no card number) only if they belong to this set
      if (!ca?.number && !item.rarityName) return false;
      // Skip sealed products (booster boxes, packs, cases etc.)
      if (!item.rarityName) return false;
      return true;
    });

    all.push(...validItems);
    from += items.length;

    if (items.length < size) break;
    await sleep(300);
  }

  return all;
}

// ──────────────────────────────────────────────────────────────────────────────
// Scrydex fetch
// ──────────────────────────────────────────────────────────────────────────────

function parseScrydexExpansionCards(html: string): ScrydexCardLink[] {
  const results: ScrydexCardLink[] = [];
  // href="/onepiece/cards/{slug}/{OP01-001}?variant={name}"
  const re =
    /href="\/onepiece\/cards\/([^/"]+)\/(OP\d{2}-\d+|ST\d{2}-\d+|EB\d{2}-\d+|PRB\d+-\d+)\?variant=([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    const cardId = m[2].toUpperCase();
    const variant = m[3];

    // Find image URL in the surrounding context (within 1500 chars of the anchor)
    const ctx = html.slice(m.index, m.index + 1500);
    const imgMatch = ctx.match(
      /src="(https:\/\/images\.scrydex\.com\/onepiece\/[^"]+)"/i,
    );
    const imageUrl = imgMatch ? imgMatch[1] : buildScrydexImageUrl(cardId, variant);

    // Deduplicate: keep first occurrence of each cardId+variant
    if (!results.some((r) => r.cardId === cardId && r.variant === variant)) {
      results.push({ slug, cardId, variant, imageUrl });
    }
  }
  return results;
}

function buildScrydexImageUrl(cardId: string, variant: string): string {
  // Scrydex CDN pattern:
  //   normal  → OP01-001/medium
  //   altArt  → OP01-001A/medium  (appends A)
  //   mangaAltArt → OP01-001B/medium (appends B - may vary)
  //   specialAltArt → OP01-001C/medium
  // foil uses same image as normal
  const base = `https://images.scrydex.com/onepiece`;
  const suffix = variantImageSuffix(variant);
  return `${base}/${cardId}${suffix}/medium`;
}

function variantImageSuffix(scrydexVariant: string): string {
  switch (scrydexVariant.toLowerCase()) {
    case "altart": return "A";
    case "mangaaltart": return "B";
    case "specialaltart": return "C";
    default: return ""; // normal, foil share base image
  }
}

async function fetchScrydexCards(set: OnePieceSetEntry): Promise<ScrydexCardLink[]> {
  if (!set.scrydexId) return [];
  const url = `https://scrydex.com/onepiece/expansions/${set.scrydexId}/${set.setCode.toUpperCase()}`;
  try {
    const html = await fetchText(url);
    return parseScrydexExpansionCards(html);
  } catch (err) {
    console.warn(
      `  [Scrydex] Failed to fetch expansion ${set.setCode}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Variant normalisation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Map TCGPlayer product name suffix → canonical variant.
 * TCGPlayer encodes variants as name suffixes: "(Parallel)", "(Box Topper)",
 * "(Manga) (Alternate Art)", "(Parallel) (Manga) (Alternate Art)", etc.
 */
function normaliseTcgVariant(productName: string): OnePieceCardVariant {
  const n = productName.toLowerCase();
  if (n.includes("manga") && n.includes("alternate art")) return "mangaAltArt";
  if (n.includes("alternate art") || n.includes("alt art") || n.includes("full art")) return "altArt";
  // Only match "special" as a variant suffix in parens — not as part of the card name
  if (/\(special\)/i.test(productName)) return "specialAltArt";
  if (n.includes("parallel")) return "parallel";
  if (n.includes("box topper")) return "boxTopper";
  if (n.includes("promo")) return "promo";
  return "normal";
}

/** Strip HTML tags and decode basic entities from effect text. */
function cleanEffectText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw
    .replace(/<[^>]+>/g, "") // strip all HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/** Strip variant suffix from TCGPlayer product name to get clean card name. */
function cleanCardName(productName: string): string {
  return productName
    // Remove trailing (Parallel), (Box Topper), (Alternate Art), (Manga), (Promo) etc.
    .replace(/\s*\((Parallel|Box Topper|Alternate Art|Alt Art|Manga|Promo|Special|Full Art)\)/gi, "")
    // Remove trailing card number in parens e.g. "(024)" — only pure numbers
    .replace(/\s*\(\d{3}\)$/g, "")
    // Remove trailing wave info
    .replace(/\s*\(Wave \d+[^)]*\)/gi, "")
    .trim();
}

/** Map Scrydex variant name → canonical variant. */
function normaliseScrydexVariant(scrydexVariant: string): OnePieceCardVariant {
  switch (scrydexVariant.toLowerCase()) {
    case "altart": return "altArt";
    case "mangaaltart": return "mangaAltArt";
    case "specialaltart": return "specialAltArt";
    case "foil": return "parallel"; // Scrydex "foil" = TCGPlayer "Parallel" for most sets
    case "normal": return "normal";
    default: return "normal";
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Merge TCGPlayer + Scrydex
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build card records from TCGPlayer items + Scrydex links for a given target set.
 *
 * `tcgItems` are treated as the authoritative card list for the requested set because
 * TCGPlayer search is filtered by `setId`. Some sets still use an unexpected card-number
 * prefix, so we remap the prefix inside the set, but we do not route cards to a different
 * set based on that prefix.
 *
 * `scrydexLinks` should already be fetched for `targetSetCode`.
 * `hasScrydex` controls whether to use Scrydex or TCGPlayer CDN for images.
 */
function buildCards(
  targetSetCode: string,
  hasScrydex: boolean,
  tcgItems: TcgCardItem[],
  scrydexLinks: ScrydexCardLink[],
  tcgGroupSetCode: string, // the setCode of the TCGPlayer group we fetched from
): OnePieceCard[] {
  // Build Scrydex lookup: cardId + canonical variant → link
  const scrydexMap = new Map<string, ScrydexCardLink>();
  for (const link of scrydexLinks) {
    const canonical = normaliseScrydexVariant(link.variant);
    scrydexMap.set(`${link.cardId}::${canonical}`, link);
    scrydexMap.set(`${link.cardId}::${link.variant}`, link);
  }

  // Slug lookup: cardId → slug (from any variant)
  const slugByCardId = new Map<string, string>();
  for (const link of scrydexLinks) {
    if (!slugByCardId.has(link.cardId)) slugByCardId.set(link.cardId, link.slug);
  }

  const cards: OnePieceCard[] = [];
  // Dedup by cardNumber::variant — prefer earlier items (higher revenue rank)
  const seen = new Set<string>();

  // Card number prefix remap for the requested TCGPlayer set (e.g. ST29 → EB04)
  const remap = CARD_NUMBER_REMAP[tcgGroupSetCode];

  for (const item of tcgItems) {
    const ca = item.customAttributes;
    let cardNumber = ca?.number ?? null;
    if (!cardNumber) continue;
    cardNumber = cardNumber.trim().toUpperCase();

    // Apply remap for this group (e.g. ST29-001 → EB04-001)
    if (remap && cardNumber.startsWith(remap.from + "-")) {
      cardNumber = remap.to + cardNumber.slice(remap.from.length);
    }

    const variant = normaliseTcgVariant(item.productName);
    const dedupKey = `${cardNumber}::${variant}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const name = cleanCardName(item.productName);
    const productId = String(Math.round(item.productId ?? 0));

    // Find Scrydex image
    const scrydexLink =
      scrydexMap.get(`${cardNumber}::${variant}`) ??
      (variant === "parallel" ? scrydexMap.get(`${cardNumber}::foil`) : undefined) ??
      (variant === "altArt" ? scrydexMap.get(`${cardNumber}::altart`) : undefined) ??
      (variant === "mangaAltArt" ? scrydexMap.get(`${cardNumber}::mangaaltart`) : undefined) ??
      (variant === "normal" ? scrydexMap.get(`${cardNumber}::normal`) : undefined);

    // Image: Scrydex if available, else TCGPlayer CDN
    const imageUrl = hasScrydex
      ? (scrydexLink?.imageUrl ?? buildScrydexImageUrl(cardNumber, variant === "parallel" ? "foil" : variant))
      : TCG_IMAGE_URL(productId);
    const scrydexSlug = scrydexLink?.slug ?? slugByCardId.get(cardNumber) ?? null;

    cards.push({
      tcgplayerProductId: productId,
      cardNumber,
      name,
      setCode: targetSetCode,
      variant,
      rarity: item.rarityName ?? null,
      cardType: ca?.cardType ?? null,
      color: ca?.color ?? null,
      cost: ca?.cost != null ? Number(ca.cost) : null,
      power: ca?.power != null ? Number(ca.power) : null,
      counter: ca?.counter != null ? Number(ca.counter) : null,
      life: ca?.life != null ? Number(ca.life) : null,
      attribute: ca?.attribute ?? null,
      subtypes: ca?.subtypes ?? null,
      effect: cleanEffectText(ca?.description),
      scrydexSlug,
      imageUrl,
      imagePath: null,
    });
  }

  // Sort: card number asc, then variant
  const variantOrder: Record<string, number> = {
    normal: 0, parallel: 1, altArt: 2, mangaAltArt: 3, specialAltArt: 4, boxTopper: 5, promo: 6,
  };
  cards.sort((a, b) => {
    const numA = a.cardNumber.split("-")[1] ?? "";
    const numB = b.cardNumber.split("-")[1] ?? "";
    const n = numA.localeCompare(numB, undefined, { numeric: true });
    if (n !== 0) return n;
    return (variantOrder[a.variant] ?? 9) - (variantOrder[b.variant] ?? 9);
  });

  return cards;
}

// ──────────────────────────────────────────────────────────────────────────────
// Image download
// ──────────────────────────────────────────────────────────────────────────────

type DownloadCardImageResult = {
  imagePath: string | null;
  status: "downloaded" | "skipped" | "missing" | "failed";
};

function candidateImageUrls(card: OnePieceCard): string[] {
  const candidates: string[] = [];
  if (card.imageUrl) candidates.push(card.imageUrl);

  const tcgFallbackUrl = TCG_IMAGE_URL(card.tcgplayerProductId);
  if (!candidates.includes(tcgFallbackUrl)) candidates.push(tcgFallbackUrl);

  return candidates;
}

function findExistingImagePath(
  setImagesDir: string,
  setCode: string,
  cardNumber: string,
  variant: OnePieceCardVariant,
  preferredExt: ".jpg" | ".png",
): string | null {
  const safeVariant = variant === "normal" ? "" : `-${variant}`;
  const candidateExts = preferredExt === ".png" ? [".png", ".jpg"] : [".jpg", ".png"];

  for (const ext of candidateExts) {
    const filename = `${cardNumber}${safeVariant}${ext}`;
    const destPath = path.join(setImagesDir, filename);
    if (fs.existsSync(destPath)) {
      return `onepiece/cards/images/${setCode}/${filename}`;
    }
  }

  return null;
}

async function downloadCardImage(
  card: OnePieceCard,
  setImagesDir: string,
): Promise<DownloadCardImageResult> {
  const urls = candidateImageUrls(card);
  if (urls.length === 0) return { imagePath: null, status: "missing" };

  const safeVariant = card.variant === "normal" ? "" : `-${card.variant}`;
  const preferredUrl = urls[0];
  const ext = (preferredUrl.includes(".jpg") ? ".jpg" : ".png") as ".jpg" | ".png";

  const existingPath = findExistingImagePath(setImagesDir, card.setCode, card.cardNumber, card.variant, ext);
  if (existingPath) return { imagePath: existingPath, status: "skipped" };

  for (const url of urls) {
    const downloadExt = (url.includes(".jpg") ? ".jpg" : ".png") as ".jpg" | ".png";
    const filename = `${card.cardNumber}${safeVariant}${downloadExt}`;
    const destPath = path.join(setImagesDir, filename);
    const relPath = `onepiece/cards/images/${card.setCode}/${filename}`;

    if (DRY_RUN) {
      console.log(`    [image] would download: ${filename}`);
      return { imagePath: relPath, status: "downloaded" };
    }

    try {
      await downloadFile(url, destPath);
      return { imagePath: relPath, status: "downloaded" };
    } catch (err) {
      cleanupPartialFile(destPath);
      if (url === urls[urls.length - 1]) {
        console.warn(
          `    [image] FAILED ${card.cardNumber}${safeVariant}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { imagePath: null, status: "failed" };
}

function buildCardsForSet(
  set: OnePieceSetEntry,
  tcgItems: TcgCardItem[],
  scrydexLinks: ScrydexCardLink[],
): OnePieceCard[] {
  return buildCards(
    set.setCode,
    Boolean(set.scrydexId),
    tcgItems,
    scrydexLinks,
    set.setCode,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-set processing
// ──────────────────────────────────────────────────────────────────────────────

async function scrapeSet(set: OnePieceSetEntry, s3: S3Client): Promise<void> {
  console.log(`\n── ${set.setCode}: ${set.name} ──`);

  // ── TCGPlayer ──
  console.log(`  [TCGPlayer] Fetching cards...`);
  let tcgItems: TcgCardItem[] = [];
  try {
    tcgItems = await fetchTcgPlayerCards(set);
    console.log(`  [TCGPlayer] ${tcgItems.length} card versions fetched`);
  } catch (err) {
    console.warn(`  [TCGPlayer] Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Scrydex ──
  let scrydexLinks: ScrydexCardLink[] = [];
  if (set.scrydexId) {
    console.log(`  [Scrydex] Fetching card links...`);
    scrydexLinks = await fetchScrydexCards(set);
    console.log(`  [Scrydex] ${scrydexLinks.length} card+variant links found`);
    await sleep(300);
  }

  // ── Merge ──
  const cards = buildCardsForSet(set, tcgItems, scrydexLinks);
  console.log(`  Merged: ${cards.length} card records`);

  if (cards.length === 0) {
    console.warn(`  No cards found for ${set.setCode} — skipping`);
    return;
  }

  // ── Download images ──
  if (!NO_IMAGES) {
    const setImagesDir = path.join(CARDS_IMAGES_DIR, set.setCode);
    fs.mkdirSync(setImagesDir, { recursive: true });

    let downloaded = 0;
    let skipped = 0;
    for (const card of cards) {
      const result = await downloadCardImage(card, setImagesDir);
      card.imagePath = result.imagePath;
      if (!DRY_RUN && result.imagePath) {
        await uploadLocalFileToOnePieceR2(
          s3,
          path.join(REPO_ROOT, result.imagePath),
          result.imagePath.replace(/^onepiece\//, ""),
        );
      }
      if (result.status === "downloaded") downloaded++;
      if (result.status === "skipped") skipped++;
      await sleep(100);
    }
    console.log(`  [images] ${downloaded} downloaded, ${skipped} already existed`);
  }

  // ── Write JSON ──
  if (!DRY_RUN) {
    const outFile = path.join(CARDS_DATA_DIR, `${set.setCode}.json`);
    fs.writeFileSync(outFile, JSON.stringify(cards, null, 2) + "\n");
    await uploadLocalFileToOnePieceR2(s3, outFile, `cards/data/${set.setCode}.json`);
    console.log(`  Wrote ${cards.length} cards → ${path.relative(REPO_ROOT, outFile)}`);
  }

  // ── Stats ──
  const byVariant = cards.reduce<Record<string, number>>((acc, c) => {
    acc[c.variant] = (acc[c.variant] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  Variants: ${JSON.stringify(byVariant)}`);

  const noImage = cards.filter((c) => !c.imageUrl).length;
  if (noImage > 0) console.warn(`  WARNING: ${noImage} cards have no image URL`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  fs.mkdirSync(CARDS_DATA_DIR, { recursive: true });
  fs.mkdirSync(CARDS_IMAGES_DIR, { recursive: true });
  const s3 = buildOnePieceS3Client();

  const sets = JSON.parse(fs.readFileSync(SETS_FILE, "utf8")) as OnePieceSetEntry[];

  const toProcess = ONLY_SETS
    ? sets.filter((s) => ONLY_SETS.includes(s.setCode))
    : sets.filter((s) => s.tcgplayerId); // skip sets with no TCGPlayer ID

  if (ONLY_SETS) {
    const missing = ONLY_SETS.filter((c) => !sets.find((s) => s.setCode === c));
    if (missing.length > 0) {
      console.warn(`Unknown set codes: ${missing.join(", ")}`);
    }
  }

  console.log(`Processing ${toProcess.length} sets${ONLY_SETS ? ` (${ONLY_SETS.join(", ")})` : ""}...`);
  if (DRY_RUN) console.log("DRY RUN — no files will be written");
  if (NO_IMAGES) console.log("--no-images — skipping image downloads");

  for (const set of toProcess) {
    await scrapeSet(set, s3);
  }

  console.log("\nDone.");
}

await main();
