/**
 * Scrape One Piece card data from Scrydex.
 *
 * For each set in onepiece/sets/data/sets.json:
 *   1. Fetch Scrydex expansion page → unique card slug/number pairs
 *   2. Fetch each Scrydex card page → metadata + available variants
 *   3. Build card records and write onepiece/cards/data/{setCode}.json
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

type OnePieceSetEntry = {
  setCode: string;
  name: string;
  scrydexId: string | null;
};

type OnePieceCard = {
  priceKey: string;
  tcgplayerProductId: null;
  cardNumber: string;
  name: string;
  setCode: string;
  variant: string;
  rarity: string | null;
  cardType: string[] | null;
  color: string[] | null;
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string[] | null;
  subtypes: string[] | null;
  effect: string | null;
  scrydexSlug: string | null;
  imageUrl: string | null;
  imagePath: string | null;
};

type ScrydexCardRef = {
  slug: string;
  cardNumber: string;
  initialVariant: string;
};

type ScrydexCardMeta = {
  cardNumber: string;
  name: string;
  rarity: string | null;
  cardType: string[] | null;
  color: string[] | null;
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string[] | null;
  subtypes: string[] | null;
  effect: string | null;
  variants: string[];
};

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
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
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

function parseNullableNumber(value: string | null): number | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;
  const digits = trimmed.replace(/,/g, "");
  const num = Number.parseInt(digits, 10);
  return Number.isFinite(num) ? num : null;
}

function parseListField(value: string | null): string[] | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;
  const items = trimmed.split(/\s*,\s*/u).map((entry) => entry.trim()).filter(Boolean);
  return items.length ? items : null;
}

function parseTextField(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return null;
  return trimmed;
}

function parseDevPaneField(html: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `data-target-field="${escaped}"[\\s\\S]*?<div class="overflow-x-auto[^"]*">([\\s\\S]*?)<\\/div>`,
    "i",
  );
  const match = html.match(re);
  if (!match) return null;
  return stripTags(match[1]);
}

function parseRulesField(html: string): string | null {
  const value = parseDevPaneField(html, "rules");
  if (value) return value;

  const visibleMatch = html.match(
    /<div class="mb-2 text-sm text-white">Rules<\/div>[\s\S]*?<span class="block mt-2">([\s\S]*?)<\/span>/i,
  );
  return visibleMatch ? stripTags(visibleMatch[1]) : null;
}

function parseVariantSlugs(html: string, fallbackVariant: string): string[] {
  const found = new Set<string>();

  for (const match of html.matchAll(/data-variant="([^"]+)" data-prices-target="pricesContainer"/g)) {
    found.add(match[1].trim());
  }
  for (const match of html.matchAll(/purchase\?type=&variant=([^"&]+)/g)) {
    found.add(decodeURIComponent(match[1].trim()));
  }

  if (found.size === 0) found.add(fallbackVariant || "normal");
  return [...found].sort((a, b) => a.localeCompare(b));
}

function variantImageSuffix(variant: string): string {
  switch (variant.trim()) {
    case "altArt":
    case "fullArt":
      return "A";
    case "mangaAltArt":
      return "B";
    case "specialAltArt":
      return "C";
    default:
      return "";
  }
}

function buildScrydexImageUrl(cardNumber: string, variant: string): string {
  const base = "https://images.scrydex.com/onepiece";
  return `${base}/${cardNumber}${variantImageSuffix(variant)}/medium`;
}

function priceKeyForCard(setCode: string, cardNumber: string, variant: string): string {
  return [setCode.trim().toUpperCase(), cardNumber.trim().toUpperCase(), variant.trim() || "normal"].join("::");
}

function parseCardMeta(html: string, fallbackCardNumber: string, fallbackVariant: string): ScrydexCardMeta {
  const name =
    parseTextField(parseDevPaneField(html, "name")) ??
    stripTags(html.match(/<title>([^#<]+?)\s+#/i)?.[1] ?? "") ??
    fallbackCardNumber;
  const cardNumber =
    parseTextField(parseDevPaneField(html, "printed_number")) ??
    fallbackCardNumber;

  return {
    cardNumber,
    name,
    rarity: parseTextField(parseDevPaneField(html, "rarity")),
    cardType: parseListField(parseDevPaneField(html, "type")),
    color: parseListField(parseDevPaneField(html, "colors")),
    cost: parseNullableNumber(parseDevPaneField(html, "cost")),
    power: parseNullableNumber(parseDevPaneField(html, "power")),
    counter: parseNullableNumber(parseDevPaneField(html, "counter")),
    life: parseNullableNumber(parseDevPaneField(html, "life")),
    attribute: parseListField(parseDevPaneField(html, "attribute")),
    subtypes: parseListField(parseDevPaneField(html, "subtypes")),
    effect: parseTextField(parseRulesField(html)),
    variants: parseVariantSlugs(html, fallbackVariant),
  };
}

function parseScrydexExpansionCards(html: string): ScrydexCardRef[] {
  const best = new Map<string, ScrydexCardRef>();
  const re = /href="\/onepiece\/cards\/([^/"]+)\/(OP\d{2}-\d+|ST\d{2}-\d+|EB\d{2}-\d+|PRB\d+-\d+)\?variant=([^"]+)"/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const slug = match[1].trim();
    const cardNumber = match[2].trim().toUpperCase();
    const initialVariant = match[3].trim();
    if (!best.has(cardNumber)) {
      best.set(cardNumber, { slug, cardNumber, initialVariant });
    }
  }

  return [...best.values()].sort((a, b) =>
    a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true }),
  );
}

async function fetchScrydexExpansionCards(set: OnePieceSetEntry): Promise<ScrydexCardRef[]> {
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

async function fetchScrydexCardMeta(cardRef: ScrydexCardRef): Promise<ScrydexCardMeta | null> {
  const url = `https://scrydex.com/onepiece/cards/${cardRef.slug}/${cardRef.cardNumber}?variant=${encodeURIComponent(cardRef.initialVariant || "normal")}`;
  try {
    const html = await fetchText(url);
    return parseCardMeta(html, cardRef.cardNumber, cardRef.initialVariant);
  } catch (err) {
    console.warn(
      `    [Scrydex] Failed to fetch card ${cardRef.cardNumber}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function buildCards(set: OnePieceSetEntry, refs: ScrydexCardRef[], metaByCardNumber: Map<string, ScrydexCardMeta>): OnePieceCard[] {
  const cards: OnePieceCard[] = [];

  for (const ref of refs) {
    const meta = metaByCardNumber.get(ref.cardNumber);
    if (!meta) continue;

    for (const variant of meta.variants) {
      cards.push({
        priceKey: priceKeyForCard(set.setCode, meta.cardNumber, variant),
        tcgplayerProductId: null,
        cardNumber: meta.cardNumber,
        name: meta.name,
        setCode: set.setCode,
        variant,
        rarity: meta.rarity,
        cardType: meta.cardType,
        color: meta.color,
        cost: meta.cost,
        power: meta.power,
        counter: meta.counter,
        life: meta.life,
        attribute: meta.attribute,
        subtypes: meta.subtypes,
        effect: meta.effect,
        scrydexSlug: ref.slug,
        imageUrl: buildScrydexImageUrl(meta.cardNumber, variant),
        imagePath: null,
      });
    }
  }

  cards.sort((a, b) => {
    const numberCompare = a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true });
    if (numberCompare !== 0) return numberCompare;
    return (a.variant || "normal").localeCompare(b.variant || "normal");
  });

  return cards;
}

type DownloadCardImageResult = {
  imagePath: string | null;
  status: "downloaded" | "skipped" | "missing" | "failed";
};

function candidateImageUrls(card: OnePieceCard): string[] {
  const candidates: string[] = [];
  if (card.imageUrl) candidates.push(card.imageUrl);

  const fallback = buildScrydexImageUrl(card.cardNumber, "normal");
  if (!candidates.includes(fallback)) candidates.push(fallback);

  return candidates;
}

function findExistingImagePath(
  setImagesDir: string,
  setCode: string,
  cardNumber: string,
  variant: string,
  preferredExt: ".jpg" | ".png",
): string | null {
  const safeVariant = variant === "normal" ? "" : `-${variant}`;
  const candidateExts = preferredExt === ".png" ? [".png", ".jpg"] : [".jpg", ".png"];

  for (const ext of candidateExts) {
    const filename = `${cardNumber}${safeVariant}${ext}`;
    const destPath = path.join(setImagesDir, filename);
    if (fs.existsSync(destPath)) return `onepiece/cards/images/${setCode}/${filename}`;
  }

  return null;
}

async function downloadCardImage(card: OnePieceCard, setImagesDir: string): Promise<DownloadCardImageResult> {
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

async function scrapeSet(set: OnePieceSetEntry, s3: S3Client): Promise<void> {
  console.log(`\n── ${set.setCode}: ${set.name} ──`);

  console.log("  [Scrydex] Fetching expansion cards...");
  const refs = await fetchScrydexExpansionCards(set);
  console.log(`  [Scrydex] ${refs.length} unique cards found`);
  if (refs.length === 0) return;

  const metaByCardNumber = new Map<string, ScrydexCardMeta>();
  let index = 0;
  for (const ref of refs) {
    index += 1;
    const meta = await fetchScrydexCardMeta(ref);
    if (meta) metaByCardNumber.set(ref.cardNumber, meta);
    if (index % 25 === 0 || index === refs.length) {
      console.log(`  [Scrydex] card pages ${index}/${refs.length}`);
    }
    await sleep(100);
  }

  const cards = buildCards(set, refs, metaByCardNumber);
  console.log(`  Merged: ${cards.length} card records`);
  if (cards.length === 0) return;

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
      await sleep(50);
    }
    console.log(`  [images] ${downloaded} downloaded, ${skipped} already existed`);
  }

  if (!DRY_RUN) {
    const outFile = path.join(CARDS_DATA_DIR, `${set.setCode}.json`);
    fs.writeFileSync(outFile, JSON.stringify(cards, null, 2) + "\n");
    await uploadLocalFileToOnePieceR2(s3, outFile, `cards/data/${set.setCode}.json`);
    console.log(`  Wrote ${cards.length} cards → ${path.relative(REPO_ROOT, outFile)}`);
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(CARDS_DATA_DIR, { recursive: true });
  fs.mkdirSync(CARDS_IMAGES_DIR, { recursive: true });
  const s3 = buildOnePieceS3Client();

  const sets = JSON.parse(fs.readFileSync(SETS_FILE, "utf8")) as OnePieceSetEntry[];
  const toProcess = ONLY_SETS
    ? sets.filter((s) => ONLY_SETS.includes(s.setCode))
    : sets.filter((s) => Boolean(s.scrydexId));

  if (ONLY_SETS) {
    const missing = ONLY_SETS.filter((c) => !sets.find((s) => s.setCode === c));
    if (missing.length > 0) console.warn(`Unknown set codes: ${missing.join(", ")}`);
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
