/**
 * Scrape One Piece TCG set data from Scrydex (expansion list + per-expansion pages).
 *
 * Outputs (local):
 *   data/onepiece/sets/data/sets.json   — set catalog (tcgplayerId / tcgplayerUrlSlug left null)
 *   data/onepiece/sets/images/{setCode}.{ext}  — downloaded set images (from Scrydex)
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeOnePieceSets.ts
 *   node --import tsx/esm scripts/scrapeOnePieceSets.ts --dry-run
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import type { S3Client } from "@aws-sdk/client-s3";
import { buildOnePieceS3Client, uploadLocalFileToOnePieceR2 } from "../lib/onepieceR2";
import { onepieceLocalDataRoot } from "../lib/onepieceLocalDataPaths";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

const DRY_RUN = process.argv.includes("--dry-run");
loadEnvFilesFromRepoRoot(import.meta.url);
/** When set (env or `--skip-r2`), write only under `data/onepiece/` locally — no R2 uploads. */
const SKIP_R2 =
  process.env.SKIP_ONEPIECE_R2 === "1" || process.env.SKIP_ONEPIECE_R2 === "true" || process.argv.includes("--skip-r2");

const SETS_DATA_DIR = path.join(onepieceLocalDataRoot, "sets", "data");
const SETS_IMAGES_DIR = path.join(onepieceLocalDataRoot, "sets", "images");
const SETS_FILE = path.join(SETS_DATA_DIR, "sets.json");

const SCRYDEX_EXPANSIONS_URL = "https://scrydex.com/onepiece/expansions";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type SetType = "Booster Pack" | "Starter Deck" | "Extra Booster" | "Premium Booster" | "Promo";

type OnePieceSet = {
  /** Internal monotonic id */
  id: string;
  /** Canonical set code, e.g. OP01, OP02, ST01 */
  setCode: string;
  name: string;
  /** Product type group */
  setType: SetType | null;
  releaseDate: string | null;
  cardCount: number | null;
  /** Scrydex expansion slug, e.g. "romance-dawn" */
  scrydexId: string | null;
  /** Legacy: TCGPlayer set id — not set by Scrydex-only scrape */
  tcgplayerId: string | null;
  /** Legacy: TCGPlayer URL slug — not set by Scrydex-only scrape */
  tcgplayerUrlSlug: string | null;
  /** URL to the set logo/image (Scrydex CDN) */
  imageUrl: string | null;
  /** Local relative path after download */
  imagePath: string | null;
};

function deriveSetType(setCode: string): SetType | null {
  if (/^OP\d+$/i.test(setCode)) return "Booster Pack";
  if (/^ST\d+$/i.test(setCode)) return "Starter Deck";
  if (/^EB\d+$/i.test(setCode)) return "Extra Booster";
  if (/^PRB\d+$/i.test(setCode)) return "Premium Booster";
  if (/^PR/i.test(setCode)) return "Promo";
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ──────────────────────────────────────────────────────────────────────────────

async function fetchText(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(
      url,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...extraHeaders,
        },
        method: "GET",
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location as string, extraHeaders).then(resolve).catch(reject);
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

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.request(url, { headers: { "User-Agent": UA } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location as string, destPath).then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode ?? "?"} downloading ${url}`));
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

// ──────────────────────────────────────────────────────────────────────────────
// HTML helpers
// ──────────────────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// Scrydex parser
// ──────────────────────────────────────────────────────────────────────────────

type ScrydexExpansionRow = {
  scrydexId: string;
  name: string;
  setCode: string;
  releaseDate: string | null;
  cardCount: number | null;
  imageUrl: string | null;
};

function parseScrydexExpansions(html: string): ScrydexExpansionRow[] {
  const results: ScrydexExpansionRow[] = [];

  // Each expansion is a card/link: href="/onepiece/expansions/{slug}/{code}"
  // Pattern captures slug and set code from URL, then image + name + metadata
  const expansionLinkRe =
    /<a[^>]+href="\/onepiece\/expansions\/([^/"]+)\/([^/"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = expansionLinkRe.exec(html)) !== null) {
    const slug = match[1].trim();
    const rawCode = match[2].trim().toUpperCase();
    const inner = match[3];

    // Skip pagination / non-expansion links
    if (!rawCode.match(/^(OP|ST|EB|PRB?|OPCG)\d*/i)) continue;

    // Image URL
    const imgMatch = inner.match(/src="(https:\/\/images\.scrydex\.com\/[^"]+)"/i);
    const imageUrl = imgMatch ? imgMatch[1].trim() : null;

    // Name — look for heading text
    const nameMatch = inner.match(/<(?:h[1-6]|div|span)[^>]*class="[^"]*(?:heading|title|name)[^"]*"[^>]*>([^<]+)<\/(?:h[1-6]|div|span)>/i)
      ?? inner.match(/<(?:h[1-6])[^>]*>([^<]+)<\/h[1-6]>/i)
      ?? inner.match(/class="[^"]*text-heading[^"]*"[^>]*>([^<]+)</i);
    const rawName = nameMatch ? stripTags(nameMatch[1]) : stripTags(inner).split("\n")[0].trim();
    const name = rawName.replace(/\s*\d{4}\/\d{2}\/\d{2}$/, "").trim();

    // Card count
    const countMatch = inner.match(/(\d+)\s*cards?/i);
    const cardCount = countMatch ? parseInt(countMatch[1], 10) : null;

    // Release date YYYY/MM/DD or YYYY-MM-DD
    const dateMatch = inner.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
    const releaseDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
      : null;

    if (slug && rawCode) {
      results.push({
        scrydexId: slug,
        name: name || rawCode,
        setCode: rawCode,
        releaseDate,
        cardCount,
        imageUrl,
      });
    }
  }

  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// Scrydex individual expansion page parser (for richer metadata)
// ──────────────────────────────────────────────────────────────────────────────

type ScrydexExpansionDetail = {
  name: string;
  setCode: string;
  releaseDate: string | null;
  cardCount: number | null;
  imageUrl: string | null;
};

function parseScrydexExpansionPage(html: string, slug: string): ScrydexExpansionDetail {
  // Title
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const name = h1Match ? stripTags(h1Match[1]) : slug;

  // Metadata row: code • series • N cards • Released YYYY/MM/DD
  const metaRe =
    /<span[^>]*class="[^"]*text-body-14[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?Released (\d{4}\/\d{2}\/\d{2})/i;
  const metaMatch = html.match(metaRe);

  // Set code from meta span
  const codeSpanMatch = html.match(
    /<span[^>]*class="[^"]*bg-mono-2[^"]*"[^>]*>([^<]+)<\/span>/i,
  );
  const setCode = codeSpanMatch ? stripTags(codeSpanMatch[1]).toUpperCase() : "";

  // Prefer the heading-style count (e.g. <span class="text-heading-16">121 cards</span>)
  const cardCountMatch = html.match(/text-heading-16[^>]*>(\d+) cards</i) ?? html.match(/(\d+)\s*cards?/i);
  const cardCount = cardCountMatch ? parseInt(cardCountMatch[1], 10) : null;

  const dateMatch = (metaMatch?.[2] ?? html.match(/Released (\d{4}\/\d{2}\/\d{2})/i)?.[1] ?? "").match(
    /(\d{4})\/(\d{2})\/(\d{2})/,
  );
  const releaseDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;

  // Logo image — look for CDN image with "logo" in URL
  const logoMatch =
    html.match(/https:\/\/images\.scrydex\.com\/onepiece\/[^"'\s]*logo[^"'\s]*/i) ??
    html.match(/<img[^>]+src="(https:\/\/images\.scrydex\.com\/onepiece\/[^"]+)"[^>]*class="[^"]*logo[^"]*"/i) ??
    html.match(/<img[^>]+class="[^"]*logo[^"]*"[^>]+src="(https:\/\/images\.scrydex\.com\/onepiece\/[^"]+)"/i);

  // Fallback: any og:image
  const ogImageMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);

  // Best image guess: CDN logo > og:image
  const imageUrl =
    (logoMatch ? (logoMatch[0].startsWith("http") ? logoMatch[0] : logoMatch[1]) : null) ??
    ogImageMatch?.[1] ??
    null;

  return { name, setCode, releaseDate, cardCount, imageUrl };
}

function guessSetCodeFromScrydexSlug(slug: string): string | null {
  // slugs like "romance-dawn-op-01" → OP01 or "starter-deck-01-st-01" → ST01
  const m = slug.match(/-(op|st|eb|prb?)-?(\d+)$/i) ?? slug.match(/^(op|st|eb|prb?)(\d+)$/i);
  if (m) return `${m[1].toUpperCase()}${m[2].padStart(2, "0")}`;
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Image downloader
// ──────────────────────────────────────────────────────────────────────────────

function extFromUrl(url: string): string {
  const u = new URL(url);
  const last = u.pathname.split("/").pop() ?? "";
  const dotIdx = last.lastIndexOf(".");
  if (dotIdx >= 0) {
    const ext = last.slice(dotIdx + 1).toLowerCase().split("?")[0];
    if (["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(ext)) return ext;
  }
  return "png";
}

async function downloadSetImage(
  set: OnePieceSet,
  s3: S3Client,
): Promise<string | null> {
  if (!set.imageUrl) return null;
  const ext = extFromUrl(set.imageUrl);
  const filename = `${set.setCode.toLowerCase()}.${ext}`;
  const destPath = path.join(SETS_IMAGES_DIR, filename);
  const relPath = `onepiece/sets/images/${filename}`;

  if (fs.existsSync(destPath)) {
    console.log(`  [image] already exists: ${filename}`);
    if (!DRY_RUN && !SKIP_R2) {
      await uploadLocalFileToOnePieceR2(s3, destPath, `sets/images/${filename}`);
    }
    return relPath;
  }

  if (DRY_RUN) {
    console.log(`  [image] would download: ${set.imageUrl} → ${filename}`);
    return relPath;
  }

  try {
    await downloadFile(set.imageUrl, destPath);
    if (!SKIP_R2) {
      await uploadLocalFileToOnePieceR2(s3, destPath, `sets/images/${filename}`);
    }
    console.log(`  [image] downloaded: ${filename}`);
    return relPath;
  } catch (err) {
    console.warn(`  [image] FAILED ${set.setCode}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Merge logic
// ──────────────────────────────────────────────────────────────────────────────

function mergeIntoSets(
  sets: Map<string, OnePieceSet>,
  nextId: { current: number },
  setCode: string,
  patch: Partial<OnePieceSet>,
): void {
  const existing = sets.get(setCode);
  if (existing) {
    // Merge, preferring non-null values
    for (const [k, v] of Object.entries(patch)) {
      if (v != null && (existing as Record<string, unknown>)[k] == null) {
        (existing as Record<string, unknown>)[k] = v;
      }
    }
  } else {
    sets.set(setCode, {
      id: String(nextId.current++),
      setCode,
      name: setCode,
      setType: deriveSetType(setCode),
      releaseDate: null,
      cardCount: null,
      scrydexId: null,
      tcgplayerId: null,
      tcgplayerUrlSlug: null,
      imageUrl: null,
      imagePath: null,
      ...patch,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  fs.mkdirSync(SETS_DATA_DIR, { recursive: true });
  fs.mkdirSync(SETS_IMAGES_DIR, { recursive: true });
  const s3 = buildOnePieceS3Client();

  const sets = new Map<string, OnePieceSet>();
  const nextId = { current: 1 };

  // ── 1. Scrydex expansions list ──────────────────────────────────────────────
  console.log("Fetching Scrydex One Piece expansions list...");
  let scrydexListHtml = "";
  try {
    scrydexListHtml = await fetchText(SCRYDEX_EXPANSIONS_URL);
  } catch (err) {
    console.warn(`  [Scrydex] Could not fetch expansions list: ${err instanceof Error ? err.message : String(err)}`);
  }

  const scrydexRows = scrydexListHtml ? parseScrydexExpansions(scrydexListHtml) : [];
  console.log(`  Found ${scrydexRows.length} sets from Scrydex list page.`);

  // For each Scrydex set, fetch the individual expansion page for richer data + better image
  for (const row of scrydexRows) {
    // Scrydex requires uppercase set code in the URL (lowercase returns HTTP 500)
    const expansionUrl = `https://scrydex.com/onepiece/expansions/${row.scrydexId}/${row.setCode.toUpperCase()}`;
    console.log(`  Fetching Scrydex expansion: ${row.setCode} (${row.scrydexId})...`);

    let detail: ScrydexExpansionDetail = {
      name: row.name,
      setCode: row.setCode,
      releaseDate: row.releaseDate,
      cardCount: row.cardCount,
      imageUrl: row.imageUrl,
    };

    try {
      const pageHtml = await fetchText(expansionUrl);
      const parsed = parseScrydexExpansionPage(pageHtml, row.scrydexId);
      detail = {
        name: parsed.name || detail.name,
        setCode: parsed.setCode || detail.setCode,
        releaseDate: parsed.releaseDate ?? detail.releaseDate,
        cardCount: parsed.cardCount ?? detail.cardCount,
        imageUrl: parsed.imageUrl ?? detail.imageUrl,
      };
    } catch (err) {
      console.warn(`    [Scrydex] Failed to fetch expansion page for ${row.setCode}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const resolvedCode = detail.setCode || row.setCode || guessSetCodeFromScrydexSlug(row.scrydexId) || row.setCode;

    mergeIntoSets(sets, nextId, resolvedCode, {
      name: detail.name,
      releaseDate: detail.releaseDate,
      cardCount: detail.cardCount,
      scrydexId: row.scrydexId,
      imageUrl: detail.imageUrl,
    });

    // Small delay to be polite
    await new Promise((r) => setTimeout(r, 300));
  }

  // ── 2. Post-process: rename sets whose code couldn't be determined automatically ──
  //
  // Rare Scrydex/list quirks (e.g. truncated set code in an older scrape).
  //
  const KNOWN_RENAMES: Record<string, { setCode: string; name: string }> = {
    ADVENTUR: { setCode: "OP15", name: "Adventure on Kami's Island" },
  };
  for (const [badCode, fix] of Object.entries(KNOWN_RENAMES)) {
    const existing = sets.get(badCode);
    if (existing) {
      sets.delete(badCode);
      existing.setCode = fix.setCode;
      existing.name = fix.name;
      sets.set(fix.setCode, existing);
    }
  }

  // Sort sets by release date then code
  const sortedSets = [...sets.values()].sort((a, b) => {
    const aDate = a.releaseDate ? Date.parse(a.releaseDate) : 0;
    const bDate = b.releaseDate ? Date.parse(b.releaseDate) : 0;
    if (aDate !== bDate) return aDate - bDate;
    return a.setCode.localeCompare(b.setCode);
  });

  // ── 3. Download images ──────────────────────────────────────────────────────
  console.log("\nDownloading set images...");
  for (const set of sortedSets) {
    if (set.imageUrl) {
      set.imagePath = await downloadSetImage(set, s3);
      await new Promise((r) => setTimeout(r, 200));
    } else {
      console.log(`  [image] no image for ${set.setCode}`);
    }
  }

  // ── 4. Write output ─────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    fs.writeFileSync(SETS_FILE, JSON.stringify(sortedSets, null, 2) + "\n");
    if (!SKIP_R2) {
      await uploadLocalFileToOnePieceR2(s3, SETS_FILE, "sets/data/sets.json");
    }
    console.log(`\nWrote ${sortedSets.length} sets to ${SETS_FILE}${SKIP_R2 ? " (skip R2)" : ""}`);
  }

  // ── 5. Summary ──────────────────────────────────────────────────────────────
  console.log("\n── Set Summary (Scrydex) ──────────────────────────────────");
  console.log(`${"Code".padEnd(10)} ${"Scrydex ID".padEnd(32)} ${"Cards".padEnd(6)} ${"Release".padEnd(12)} Name`);
  console.log("─".repeat(100));
  for (const set of sortedSets) {
    console.log(
      `${set.setCode.padEnd(10)} ${(set.scrydexId ?? "—").padEnd(32)} ${String(set.cardCount ?? "?").padEnd(6)} ${(set.releaseDate ?? "unknown").padEnd(12)} ${set.name}`,
    );
  }
  console.log(`\nTotal: ${sortedSets.length} sets`);
  const missingImage = sortedSets.filter((s) => !s.imageUrl);
  if (missingImage.length > 0) {
    console.log(`\nSets missing images: ${missingImage.map((s) => s.setCode).join(", ")}`);
  }
  const missingScrydex = sortedSets.filter((s) => !s.scrydexId);
  if (missingScrydex.length > 0) {
    console.log(`Sets missing Scrydex ID: ${missingScrydex.map((s) => s.setCode).join(", ")}`);
  }
}

await main();
