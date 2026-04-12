/**
 * Scrape Disney Lorcana expansion list from Scrydex.
 *
 * Source: https://scrydex.com/lorcana/expansions
 *
 * Output:
 *   data/lorcana/sets/data/sets.json   — JSON array of set records
 *   data/lorcana/sets/images/{code}.{ext} — set logos on disk
 *   imagePath in JSON is the R2 key: lorcana/sets/images/{code}.{ext} (no data/ prefix)
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeLorcanaSets.ts
 *   node --import tsx/esm scripts/scrapeLorcanaSets.ts --dry-run
 *   node --import tsx/esm scripts/scrapeLorcanaSets.ts --list-only   # skip per-set pages (no card counts)
 *   node --import tsx/esm scripts/scrapeLorcanaSets.ts --no-images    # skip logo downloads
 *   node --import tsx/esm scripts/scrapeLorcanaSets.ts --images-only  # only download logos (reads sets.json)
 *
 * Card counts are not on the expansions list; the script fetches each
 * /lorcana/expansions/{slug}/{SETCODE} page unless --list-only is set.
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { lorcanaLocalDataRoot } from "../lib/lorcanaLocalDataPaths";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const DRY_RUN = process.argv.includes("--dry-run");
const LIST_ONLY = process.argv.includes("--list-only");
const NO_IMAGES = process.argv.includes("--no-images");
const IMAGES_ONLY = process.argv.includes("--images-only");

const SETS_DATA_DIR = path.join(lorcanaLocalDataRoot, "sets", "data");
const SETS_IMAGES_DIR = path.join(lorcanaLocalDataRoot, "sets", "images");
const SETS_FILE = path.join(SETS_DATA_DIR, "sets.json");

const SCRYDEX_EXPANSIONS_URL = "https://scrydex.com/lorcana/expansions";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ──────────────────────────────────────────────────────────────────────────────

type LorcanaSet = {
  id: string;
  setCode: string;
  name: string;
  releaseDate: string | null;
  cardCount: number | null;
  scrydexId: string | null;
  tcgplayerId: string | null;
  tcgplayerUrlSlug: string | null;
  imageUrl: string | null;
  imagePath: string | null;
};

type ScrydexExpansionRow = {
  scrydexId: string;
  name: string;
  setCode: string;
  releaseDate: string | null;
  cardCount: number | null;
  imageUrl: string | null;
};

// ──────────────────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(
      url,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        method: "GET",
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location as string).then(resolve).catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode ?? "?"} fetching ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse expansion cards from the Scrydex Lorcana expansions page.
 * Links look like: /lorcana/expansions/{slug}/{SETCODE}
 */
function parseLorcanaExpansions(html: string): ScrydexExpansionRow[] {
  const byCode = new Map<string, ScrydexExpansionRow>();

  const expansionLinkRe =
    /<a\s+[^>]*?href="\/lorcana\/expansions\/([^/"]+)\/([^/"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = expansionLinkRe.exec(html)) !== null) {
    const slug = match[1].trim();
    const rawCode = match[2].trim().toUpperCase();
    const inner = match[3];
    // Ignore sidebar / compact links without the expansion tile (logo + date spans).
    if (!inner.includes("images.scrydex.com")) continue;

    const full = match[0];
    const openTag = full.slice(0, full.indexOf(">") + 1);

    const dataNameMatch = openTag.match(/data-name="([^"]*)"/);
    const nameFromAttr = dataNameMatch ? decodeHtmlEntities(dataNameMatch[1]) : null;

    const imgMatch = inner.match(/src="(https:\/\/images\.scrydex\.com\/lorcana\/[^"]+)"/i);
    const imageUrl = imgMatch ? imgMatch[1].trim() : null;

    const spanPair = inner.match(
      /<span>([^<]+)<\/span>\s*<span>(\d{4}\/\d{2}\/\d{2})<\/span>/,
    );
    const nameFromSpans = spanPair ? decodeHtmlEntities(spanPair[1].trim()) : null;
    const dateMatch = spanPair?.[2]?.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    const releaseDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    const name = nameFromAttr ?? nameFromSpans ?? slug.replace(/-/g, " ");
    const cleanName = name.replace(/\s*\d{4}\/\d{2}\/\d{2}\s*$/, "").trim();

    if (!rawCode || !slug) continue;

    const row: ScrydexExpansionRow = {
      scrydexId: slug,
      name: cleanName || rawCode,
      setCode: rawCode,
      releaseDate,
      cardCount: null,
      imageUrl,
    };

    const existing = byCode.get(rawCode);
    if (!existing) {
      byCode.set(rawCode, row);
    } else if (!existing.releaseDate && row.releaseDate) {
      byCode.set(rawCode, row);
    } else if (!existing.imageUrl && row.imageUrl) {
      byCode.set(rawCode, row);
    }
  }

  return [...byCode.values()];
}

/** Card count lives on each expansion's detail page (not the list). */
function parseCardCountFromExpansionPage(html: string): number | null {
  const heading = html.match(/text-heading-16[^>]*>(\d+)\s*cards/i);
  return heading ? parseInt(heading[1], 10) : null;
}

function expansionPageUrl(row: ScrydexExpansionRow): string {
  return `https://scrydex.com/lorcana/expansions/${row.scrydexId}/${row.setCode}`;
}

async function enrichCardCountsFromDetailPages(rows: ScrydexExpansionRow[]): Promise<void> {
  const delayMs = Number.parseInt(process.env.SCRYDEX_LORCANA_DETAIL_DELAY_MS ?? "150", 10);
  let ok = 0;
  let i = 0;
  for (const row of rows) {
    i += 1;
    const url = expansionPageUrl(row);
    process.stdout.write(`\r  Fetching set pages for card counts… [${i}/${rows.length}] ${row.setCode}   `);
    try {
      const pageHtml = await fetchText(url);
      row.cardCount = parseCardCountFromExpansionPage(pageHtml);
      if (row.cardCount != null) ok += 1;
    } catch (e) {
      console.warn(`\n  WARN ${row.setCode} (${url}): ${e instanceof Error ? e.message : String(e)}`);
    }
    if (delayMs > 0 && i < rows.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  process.stdout.write("\n");
  console.log(`  Card counts resolved for ${ok}/${rows.length} sets.`);
}

function extFromContentType(ct: string | undefined): string {
  if (!ct) return "png";
  const base = ct.split(";")[0].trim().toLowerCase();
  if (base.includes("png")) return "png";
  if (base.includes("jpeg") || base.includes("jpg")) return "jpg";
  if (base.includes("webp")) return "webp";
  if (base.includes("svg")) return "svg";
  if (base.includes("gif")) return "gif";
  return "png";
}

/** Download binary; follows one redirect. Returns file bytes and content-type. */
async function fetchBinary(url: string): Promise<{ body: Buffer; contentType: string | undefined }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(
      url,
      { headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8" }, method: "GET" },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBinary(res.headers.location as string).then(resolve).catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode ?? "?"} fetching ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            body: Buffer.concat(chunks),
            contentType: res.headers["content-type"],
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** R2 object key for uploaded set logos (files still written under repo `data/lorcana/…`). */
function lorcanaSetLogoR2Key(fileName: string): string {
  return `lorcana/sets/images/${fileName}`;
}

/**
 * Saves logos under data/lorcana/sets/images/{setCode}.{ext} and sets imagePath to the R2 key.
 */
async function downloadSetImages(sets: LorcanaSet[]): Promise<void> {
  fs.mkdirSync(SETS_IMAGES_DIR, { recursive: true });
  const delayMs = Number.parseInt(process.env.SCRYDEX_LORCANA_IMAGE_DELAY_MS ?? "80", 10);
  let ok = 0;
  let i = 0;
  for (const set of sets) {
    i += 1;
    if (!set.imageUrl?.trim()) {
      console.warn(`  [image] no imageUrl for ${set.setCode}`);
      continue;
    }
    process.stdout.write(`\r  Downloading set images… [${i}/${sets.length}] ${set.setCode}   `);
    const baseName = set.setCode.trim().toLowerCase();
    try {
      const { body, contentType } = await fetchBinary(set.imageUrl.trim());
      const ext = extFromContentType(contentType);
      const fileName = `${baseName}.${ext}`;
      const absPath = path.join(SETS_IMAGES_DIR, fileName);
      fs.writeFileSync(absPath, body);
      set.imagePath = lorcanaSetLogoR2Key(fileName);
      ok += 1;
    } catch (e) {
      console.warn(`\n  [image] FAILED ${set.setCode}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (delayMs > 0 && i < sets.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  process.stdout.write("\n");
  console.log(`  Saved ${ok}/${sets.length} set images → ${path.relative(process.cwd(), SETS_IMAGES_DIR)}`);
}

// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (IMAGES_ONLY) {
    if (!fs.existsSync(SETS_FILE)) {
      throw new Error(`No ${SETS_FILE} — run a full scrape first (without --images-only).`);
    }
    const raw = fs.readFileSync(SETS_FILE, "utf8");
    const sets = JSON.parse(raw) as LorcanaSet[];
    console.log(`Loaded ${sets.length} sets from ${path.relative(process.cwd(), SETS_FILE)}`);
    console.log("Downloading set logo images…");
    await downloadSetImages(sets);
    fs.writeFileSync(SETS_FILE, `${JSON.stringify(sets, null, 2)}\n`, "utf8");
    console.log(`Updated → ${path.relative(process.cwd(), SETS_FILE)}`);
    return;
  }

  console.log(`Fetching ${SCRYDEX_EXPANSIONS_URL} …`);
  const html = await fetchText(SCRYDEX_EXPANSIONS_URL);
  const rows = parseLorcanaExpansions(html);
  console.log(`Parsed ${rows.length} unique expansions (by set code).`);

  if (rows.length === 0) {
    throw new Error("No expansions found — Scrydex HTML structure may have changed.");
  }

  const sorted = [...rows].sort((a, b) => {
    const ad = a.releaseDate ? Date.parse(a.releaseDate) : 0;
    const bd = b.releaseDate ? Date.parse(b.releaseDate) : 0;
    if (ad !== bd) return ad - bd;
    return a.setCode.localeCompare(b.setCode);
  });

  if (LIST_ONLY) {
    console.log("--list-only: skipping per-expansion pages (cardCount will be null).");
  } else {
    console.log("Fetching each expansion page for card counts…");
    await enrichCardCountsFromDetailPages(sorted);
  }

  let n = 0;
  const sets: LorcanaSet[] = sorted.map((row) => ({
    id: String(++n),
    setCode: row.setCode,
    name: row.name,
    releaseDate: row.releaseDate,
    cardCount: row.cardCount,
    scrydexId: row.scrydexId,
    tcgplayerId: null,
    tcgplayerUrlSlug: null,
    imageUrl: row.imageUrl,
    imagePath: null,
  }));

  if (DRY_RUN) {
    console.log("\nDry run — not writing file or images. First 3 sets:");
    console.log(JSON.stringify(sets.slice(0, 3), null, 2));
    return;
  }

  if (!NO_IMAGES) {
    console.log("\nDownloading set logo images…");
    await downloadSetImages(sets);
  } else {
    console.log("\n--no-images: skipping logo downloads.");
  }

  fs.mkdirSync(SETS_DATA_DIR, { recursive: true });
  fs.writeFileSync(SETS_FILE, `${JSON.stringify(sets, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${sets.length} sets → ${path.relative(process.cwd(), SETS_FILE)}`);

  console.log("\n── Lorcana sets (Scrydex) ────────────────────────────────");
  console.log(`${"Code".padEnd(12)} ${"Cards".padEnd(8)} ${"Release".padEnd(12)} Name`);
  console.log("─".repeat(80));
  for (const s of sets) {
    const cc = s.cardCount != null ? String(s.cardCount) : "—";
    console.log(`${s.setCode.padEnd(12)} ${cc.padEnd(8)} ${(s.releaseDate ?? "—").padEnd(12)} ${s.name}`);
  }
}

await main();
