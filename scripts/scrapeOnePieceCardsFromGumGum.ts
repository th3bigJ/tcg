/**
 * Build `data/onepiece/cards/data/{setCode}.json` from a GumGum set list when Scrydex is not available.
 * Only fields present on the list page are filled; everything else is null.
 *
 * Requires `gumgumCardsListPath` on the set row in `sets.json` (e.g. `/cards/ST29/egghead`).
 *
 * By default downloads card art from GumGum CDN into `data/onepiece/cards/images/{setCode}/`
 * (same layout as Scrydex scrapes: `{number}.webp` or `{number}-{variant}.webp`).
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeOnePieceCardsFromGumGum.ts --set=ST29
 *   node --import tsx/esm scripts/scrapeOnePieceCardsFromGumGum.ts --set=ST29 --dry-run
 *   node --import tsx/esm scripts/scrapeOnePieceCardsFromGumGum.ts --set=ST29 --no-images
 *   node --import tsx/esm scripts/scrapeOnePieceCardsFromGumGum.ts --set=ST29 --refresh-images
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import type { S3Client } from "@aws-sdk/client-s3";
import type { OnePieceCardEntry, OnePieceSetEntry } from "../lib/onepiecePricing";
import { buildOnePieceS3Client, uploadLocalFileToOnePieceR2 } from "../lib/onepieceR2";
import { onepieceLocalDataRoot } from "../lib/onepieceLocalDataPaths";
import { fetchGumgumSetListHtml, parseGumgumSetListHtml } from "../lib/gumgumOnePiece";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const DRY_RUN = process.argv.includes("--dry-run");
const NO_IMAGES = process.argv.includes("--no-images");
const REFRESH_IMAGES = process.argv.includes("--refresh-images");
const SKIP_R2 =
  process.env.SKIP_ONEPIECE_R2 === "1" || process.env.SKIP_ONEPIECE_R2 === "true" || process.argv.includes("--skip-r2");

const setArg = process.argv.find((a) => a.startsWith("--set="));
const ONLY = setArg?.slice("--set=".length).trim().toUpperCase();

const SETS_FILE = path.join(onepieceLocalDataRoot, "sets", "data", "sets.json");
const CARDS_DATA_DIR = path.join(onepieceLocalDataRoot, "cards", "data");
const CARDS_IMAGES_DIR = path.join(onepieceLocalDataRoot, "cards", "images");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function priceKeyForCard(setCode: string, cardNumber: string, variant: string): string {
  return [setCode.trim().toUpperCase(), cardNumber.trim().toUpperCase(), variant.trim() || "normal"].join("::");
}

function extensionFromImageUrl(url: string): ".webp" | ".png" {
  const base = url.split("?")[0]?.toLowerCase() ?? "";
  if (base.endsWith(".webp")) return ".webp";
  return ".png";
}

function imageFilename(cardNumber: string, variant: string, ext: ".webp" | ".png"): string {
  const num = cardNumber.trim().toUpperCase();
  const safeVariant = variant === "normal" ? "" : `-${variant}`;
  return `${num}${safeVariant}${ext}`;
}

function imageRelPath(setCode: string, cardNumber: string, variant: string, ext: ".webp" | ".png"): string {
  return `onepiece/cards/images/${setCode.trim().toUpperCase()}/${imageFilename(cardNumber, variant, ext)}`;
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

function cleanupPartialFile(destPath: string): void {
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function downloadGumgumCardImages(
  cards: OnePieceCardEntry[],
  setCode: string,
  s3: S3Client,
): Promise<void> {
  const dir = path.join(CARDS_IMAGES_DIR, setCode.toUpperCase());
  fs.mkdirSync(dir, { recursive: true });

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const card of cards) {
    const url = card.imageUrl?.trim();
    if (!url) {
      failed += 1;
      continue;
    }

    const ext = extensionFromImageUrl(url);
    const filename = imageFilename(card.cardNumber, String(card.variant), ext);
    const destAbs = path.join(dir, filename);
    const rel = imageRelPath(setCode, card.cardNumber, String(card.variant), ext);

    if (fs.existsSync(destAbs) && !REFRESH_IMAGES) {
      card.imagePath = rel;
      skipped += 1;
      continue;
    }

    try {
      await downloadFile(url, destAbs);
      card.imagePath = rel;
      ok += 1;
      if (!SKIP_R2) {
        await uploadLocalFileToOnePieceR2(s3, destAbs, rel.replace(/^onepiece\//, ""));
      }
    } catch (e) {
      cleanupPartialFile(destAbs);
      console.warn(
        `  [image] ${filename}: ${e instanceof Error ? e.message : String(e)}`,
      );
      failed += 1;
    }
    await sleep(75);
  }

  console.log(`  [images] ${ok} downloaded, ${skipped} already present, ${failed} missing/failed${SKIP_R2 ? " (skip R2)" : ""}`);
}

async function main(): Promise<void> {
  if (!ONLY) {
    throw new Error("Pass --set=ST29 (or another set code with gumgumCardsListPath).");
  }

  const sets = JSON.parse(fs.readFileSync(SETS_FILE, "utf8")) as OnePieceSetEntry[];
  const set = sets.find((s) => s.setCode.toUpperCase() === ONLY);
  if (!set) throw new Error(`Set ${ONLY} not found in sets.json`);

  const listPath = set.gumgumCardsListPath?.trim();
  if (!listPath) {
    throw new Error(`Set ${ONLY} has no gumgumCardsListPath — add it to sets.json first.`);
  }

  console.log(`Fetching ${listPath}…`);
  const html = await fetchGumgumSetListHtml(listPath);
  const rows = parseGumgumSetListHtml(html);
  if (rows.length === 0) {
    throw new Error("No card rows parsed — GumGum HTML structure may have changed.");
  }

  const cards: OnePieceCardEntry[] = rows.map((row) => ({
    priceKey: priceKeyForCard(set.setCode, row.cardNumber, String(row.variant)),
    tcgplayerProductId: null,
    cardNumber: row.cardNumber,
    name: row.name,
    setCode: set.setCode,
    variant: row.variant,
    rarity: null,
    cardType: null,
    color: null,
    cost: null,
    power: null,
    counter: null,
    life: null,
    attribute: null,
    subtypes: null,
    effect: null,
    scrydexSlug: null,
    gumgumCardId: row.gumgumCardId,
    imageUrl: row.imageUrl,
    imagePath: null,
  }));

  const uniquePrinted = new Set(rows.map((r) => r.cardNumber)).size;
  console.log(`Parsed ${rows.length} variant rows (${uniquePrinted} unique printed numbers).`);

  if (DRY_RUN) {
    console.log("Dry-run — not writing files.");
    console.log("Sample:", cards.slice(0, 2));
    return;
  }

  if (!NO_IMAGES) {
    const s3 = buildOnePieceS3Client();
    await downloadGumgumCardImages(cards, set.setCode, s3);
  } else {
    console.log("  (--no-images — skipping GumGum image downloads)");
  }

  fs.mkdirSync(CARDS_DATA_DIR, { recursive: true });
  const outFile = path.join(CARDS_DATA_DIR, `${set.setCode.toUpperCase()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(cards, null, 2) + "\n");
  console.log(`Wrote ${cards.length} cards → ${outFile}`);

  const idx = sets.findIndex((s) => s.setCode === set.setCode);
  if (idx >= 0) {
    sets[idx] = {
      ...sets[idx],
      cardCount: uniquePrinted,
    };
    fs.writeFileSync(SETS_FILE, JSON.stringify(sets, null, 2) + "\n");
    console.log(`Updated sets.json cardCount for ${set.setCode} → ${uniquePrinted} (unique numbers).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
