/**
 * Scrape Disney Lorcana card data from Scrydex for each set in data/lorcana/sets/data/sets.json.
 *
 * Outputs:
 *   data/lorcana/cards/data/{setCode}.json
 *   data/lorcana/cards/images/{setCode}/…  on disk (unless --no-images)
 *   imagePath values are R2 keys: lorcana/cards/images/{setCode}/… (no data/ prefix)
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeLorcanaCards.ts
 *   node --import tsx/esm scripts/scrapeLorcanaCards.ts --set=TFC
 *   node --import tsx/esm scripts/scrapeLorcanaCards.ts --set=TFC,P1
 *   node --import tsx/esm scripts/scrapeLorcanaCards.ts --dry-run
 *   node --import tsx/esm scripts/scrapeLorcanaCards.ts --no-images
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "node:url";
import { lorcanaLocalDataRoot } from "../lib/lorcanaLocalDataPaths";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const DRY_RUN = process.argv.includes("--dry-run");
const NO_IMAGES = process.argv.includes("--no-images");
const REFRESH_IMAGES = process.argv.includes("--refresh-images");

const setArg = process.argv.find((a) => a.startsWith("--set="));
const ONLY_SETS = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim().toUpperCase())
  : null;

const SETS_FILE = path.join(lorcanaLocalDataRoot, "sets", "data", "sets.json");
const CARDS_DATA_DIR = path.join(lorcanaLocalDataRoot, "cards", "data");
const CARDS_IMAGES_DIR = path.join(lorcanaLocalDataRoot, "cards", "images");

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type LorcanaSetEntry = {
  setCode: string;
  name: string;
  scrydexId: string | null;
};

type LorcanaCard = {
  priceKey: string;
  cardNumber: string;
  name: string;
  characterName: string | null;
  version: string | null;
  setCode: string;
  variant: string;
  rarity: string | null;
  supertype: string | null;
  subtypes: string[] | null;
  ink_type: string | null;
  cost: number | null;
  strength: number | null;
  willpower: number | null;
  lore_value: number | null;
  flavor_text: string | null;
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

type LorcanaCardMeta = {
  cardNumber: string;
  name: string;
  characterName: string | null;
  version: string | null;
  rarity: string | null;
  supertype: string | null;
  subtypes: string[] | null;
  ink_type: string | null;
  cost: number | null;
  strength: number | null;
  willpower: number | null;
  lore_value: number | null;
  flavor_text: string | null;
  effect: string | null;
  variants: string[];
  variantImages: Record<string, string>;
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

function parseAbilityTexts(html: string): string | null {
  const parts: string[] = [];
  const re =
    /data-target-field="abilities\.text"[\s\S]*?<div class="overflow-x-auto[^"]*">([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = stripTags(m[1]).trim();
    if (t) parts.push(t);
  }
  return parts.length ? parts.join("\n\n") : null;
}

function parseVariantSlugs(html: string, fallbackVariant: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\bdata-variant="([^"]+)"/g)) {
    const v = match[1].trim();
    if (v) found.add(v);
  }
  if (found.size === 0) found.add(fallbackVariant || "normal");
  return [...found].sort((a, b) => a.localeCompare(b));
}

function parseVariantImages(html: string): Record<string, string> {
  const images: Record<string, string> = {};
  for (const match of html.matchAll(/data-variant-name="([^"]+)"\s+data-variant-image="([^"]+)"/g)) {
    const variant = decodeHtml(match[1].trim());
    const imageUrl = decodeHtml(match[2].trim());
    if (!variant || !imageUrl) continue;
    images[variant] = imageUrl;
  }
  return images;
}

function buildFallbackImageUrl(cardNumber: string, variant: string): string {
  return `https://images.scrydex.com/lorcana/${cardNumber}/medium`;
}

function priceKeyForCard(setCode: string, cardNumber: string, variant: string): string {
  return [setCode.trim().toUpperCase(), cardNumber.trim(), variant.trim() || "normal"].join("::");
}

function parseLorcanaCardMeta(
  html: string,
  ref: ScrydexCardRef,
): LorcanaCardMeta | null {
  const characterName = parseTextField(parseDevPaneField(html, "name"));
  const version = parseTextField(parseDevPaneField(html, "version"));
  const name =
    characterName && version
      ? `${characterName} – ${version}`
      : characterName || version || ref.cardNumber;

  return {
    cardNumber: ref.cardNumber,
    name,
    characterName,
    version,
    rarity: parseTextField(parseDevPaneField(html, "rarity")),
    supertype: parseTextField(parseDevPaneField(html, "supertype")),
    subtypes: parseListField(parseDevPaneField(html, "subtypes")),
    ink_type: parseTextField(parseDevPaneField(html, "ink_type")),
    cost: parseNullableNumber(parseDevPaneField(html, "cost")),
    strength: parseNullableNumber(parseDevPaneField(html, "strength")),
    willpower: parseNullableNumber(parseDevPaneField(html, "willpower")),
    lore_value: parseNullableNumber(parseDevPaneField(html, "lore_value")),
    flavor_text: parseTextField(parseDevPaneField(html, "flavor_text")),
    effect: parseAbilityTexts(html),
    variants: parseVariantSlugs(html, ref.initialVariant),
    variantImages: parseVariantImages(html),
  };
}

/**
 * Card links on expansion page: /lorcana/cards/{slug}/{SETCODE-n}?variant=…
 */
function parseScrydexExpansionCards(html: string, setCodeUpper: string): ScrydexCardRef[] {
  const best = new Map<string, ScrydexCardRef>();
  const esc = setCodeUpper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `href="/lorcana/cards/([^/"]+)/(${esc}-\\d+)\\?variant=([^"]+)"`,
    "gi",
  );

  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const slug = match[1].trim();
    const cardNumber = match[2].trim().toUpperCase();
    const initialVariant = decodeURIComponent(match[3].trim());
    if (!best.has(cardNumber)) {
      best.set(cardNumber, { slug, cardNumber, initialVariant });
    }
  }

  return [...best.values()].sort((a, b) =>
    a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true }),
  );
}

async function fetchScrydexExpansionCards(set: LorcanaSetEntry): Promise<ScrydexCardRef[]> {
  if (!set.scrydexId) return [];
  const url = `https://scrydex.com/lorcana/expansions/${set.scrydexId}/${set.setCode.toUpperCase()}`;
  try {
    const html = await fetchText(url);
    return parseScrydexExpansionCards(html, set.setCode.toUpperCase());
  } catch (err) {
    console.warn(
      `  [Scrydex] Failed to fetch expansion ${set.setCode}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

async function fetchScrydexCardMeta(ref: ScrydexCardRef): Promise<LorcanaCardMeta | null> {
  const q = encodeURIComponent(ref.initialVariant || "normal");
  const url = `https://scrydex.com/lorcana/cards/${ref.slug}/${ref.cardNumber}?variant=${q}`;
  try {
    const html = await fetchText(url);
    return parseLorcanaCardMeta(html, ref);
  } catch (err) {
    console.warn(
      `    [Scrydex] Failed to fetch card ${ref.cardNumber}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function buildCards(
  set: LorcanaSetEntry,
  refs: ScrydexCardRef[],
  metaByCardNumber: Map<string, LorcanaCardMeta>,
): LorcanaCard[] {
  const cards: LorcanaCard[] = [];

  for (const ref of refs) {
    const meta = metaByCardNumber.get(ref.cardNumber);
    if (!meta) continue;

    for (const variant of meta.variants) {
      cards.push({
        priceKey: priceKeyForCard(set.setCode, meta.cardNumber, variant),
        cardNumber: meta.cardNumber,
        name: meta.name,
        characterName: meta.characterName,
        version: meta.version,
        setCode: set.setCode,
        variant,
        rarity: meta.rarity,
        supertype: meta.supertype,
        subtypes: meta.subtypes,
        ink_type: meta.ink_type,
        cost: meta.cost,
        strength: meta.strength,
        willpower: meta.willpower,
        lore_value: meta.lore_value,
        flavor_text: meta.flavor_text,
        effect: meta.effect,
        scrydexSlug: ref.slug,
        imageUrl: meta.variantImages[variant] ?? buildFallbackImageUrl(meta.cardNumber, variant),
        imagePath: null,
      });
    }
  }

  cards.sort((a, b) => {
    const numCompare = a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true });
    if (numCompare !== 0) return numCompare;
    return (a.variant || "normal").localeCompare(b.variant || "normal");
  });

  return cards;
}

function safeVariantFilePart(variant: string): string {
  return variant.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function candidateImageUrls(card: LorcanaCard): string[] {
  const out: string[] = [];
  if (card.imageUrl) out.push(card.imageUrl);
  const fb = buildFallbackImageUrl(card.cardNumber, card.variant);
  if (!out.includes(fb)) out.push(fb);
  return out;
}

function cardImageR2Key(setCode: string, filename: string): string {
  return `lorcana/cards/images/${setCode}/${filename}`;
}

function findExistingImagePath(
  setImagesDir: string,
  setCode: string,
  cardNumber: string,
  variant: string,
): string | null {
  const safeV = variant === "normal" ? "" : `-${safeVariantFilePart(variant)}`;
  for (const ext of [".jpg", ".png", ".webp"]) {
    const filename = `${cardNumber}${safeV}${ext}`;
    const destPath = path.join(setImagesDir, filename);
    if (fs.existsSync(destPath)) {
      return cardImageR2Key(setCode, filename);
    }
  }
  return null;
}

async function downloadCardImage(card: LorcanaCard, setImagesDir: string): Promise<string | null> {
  const urls = candidateImageUrls(card);
  if (urls.length === 0) return null;

  const safeV = card.variant === "normal" ? "" : `-${safeVariantFilePart(card.variant)}`;
  const existing = findExistingImagePath(setImagesDir, card.setCode, card.cardNumber, card.variant);
  if (existing && !REFRESH_IMAGES) return existing;

  const ext = (urls[0].includes(".jpg") ? ".jpg" : ".png") as ".jpg" | ".png";
  const filename = `${card.cardNumber}${safeV}${ext}`;
  const destPath = path.join(setImagesDir, filename);
  const relPath = cardImageR2Key(card.setCode, filename);

  if (DRY_RUN) {
    console.log(`    [image] would download: ${filename}`);
    return relPath;
  }

  for (const url of urls) {
    const useExt = (url.includes(".jpg") ? ".jpg" : ".png") as ".jpg" | ".png";
    const fn = `${card.cardNumber}${safeV}${useExt}`;
    const dp = path.join(setImagesDir, fn);
    const rp = cardImageR2Key(card.setCode, fn);
    try {
      await downloadFile(url, dp);
      return rp;
    } catch (err) {
      cleanupPartialFile(dp);
      if (url === urls[urls.length - 1]) {
        console.warn(
          `    [image] FAILED ${card.cardNumber} ${card.variant}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
  return null;
}

async function scrapeSet(set: LorcanaSetEntry): Promise<void> {
  console.log(`\n── ${set.setCode}: ${set.name} ──`);

  console.log("  [Scrydex] Fetching expansion card list…");
  const refs = await fetchScrydexExpansionCards(set);
  console.log(`  [Scrydex] ${refs.length} unique cards (by card number)`);
  if (refs.length === 0) return;

  const metaByCardNumber = new Map<string, LorcanaCardMeta>();
  let index = 0;
  for (const ref of refs) {
    index += 1;
    const meta = await fetchScrydexCardMeta(ref);
    if (meta) metaByCardNumber.set(ref.cardNumber, meta);
    if (index % 25 === 0 || index === refs.length) {
      console.log(`  [Scrydex] card pages ${index}/${refs.length}`);
    }
    await sleep(Number.parseInt(process.env.SCRYDEX_LORCANA_CARD_DELAY_MS ?? "100", 10));
  }

  const cards = buildCards(set, refs, metaByCardNumber);
  console.log(`  Merged: ${cards.length} card rows (all variants)`);
  if (cards.length === 0) return;

  if (!NO_IMAGES) {
    const setImagesDir = path.join(CARDS_IMAGES_DIR, set.setCode);
    fs.mkdirSync(setImagesDir, { recursive: true });

    let n = 0;
    for (const card of cards) {
      n += 1;
      const imgPath = await downloadCardImage(card, setImagesDir);
      card.imagePath = imgPath;
      if (n % 40 === 0 || n === cards.length) {
        console.log(`  [images] ${n}/${cards.length}`);
      }
      await sleep(Number.parseInt(process.env.SCRYDEX_LORCANA_IMAGE_DELAY_MS ?? "50", 10));
    }
  }

  if (!DRY_RUN) {
    const outFile = path.join(CARDS_DATA_DIR, `${set.setCode}.json`);
    fs.writeFileSync(outFile, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
    console.log(`  Wrote ${cards.length} rows → ${path.relative(REPO_ROOT, outFile)}`);
  } else {
    console.log("  DRY RUN — not writing JSON files");
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(CARDS_DATA_DIR, { recursive: true });
  fs.mkdirSync(CARDS_IMAGES_DIR, { recursive: true });

  if (!fs.existsSync(SETS_FILE)) {
    throw new Error(`Missing ${SETS_FILE} — run scrape:lorcana-sets first.`);
  }

  const sets = JSON.parse(fs.readFileSync(SETS_FILE, "utf8")) as LorcanaSetEntry[];
  const toProcess = ONLY_SETS
    ? sets.filter((s) => ONLY_SETS.includes(s.setCode.toUpperCase()))
    : sets.filter((s) => Boolean(s.scrydexId));

  if (ONLY_SETS) {
    const missing = ONLY_SETS.filter((c) => !sets.find((s) => s.setCode.toUpperCase() === c));
    if (missing.length) console.warn(`Unknown set codes: ${missing.join(", ")}`);
  }

  console.log(
    `Processing ${toProcess.length} set(s)${ONLY_SETS ? ` (${ONLY_SETS.join(", ")})` : ""}…`,
  );
  if (DRY_RUN) console.log("DRY RUN — no JSON files written");
  if (NO_IMAGES) console.log("--no-images — skipping image downloads");

  for (const set of toProcess) {
    await scrapeSet(set);
  }

  console.log("\nDone.");
}

await main();
