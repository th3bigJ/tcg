/**
 * Scrape One Piece TCG set data from Scrydex and TCGPlayer.
 *
 * Outputs:
 *   onepiece/sets/data/sets.json   — merged set catalog
 *   onepiece/sets/images/{setCode}.{ext}  — downloaded set images (from Scrydex)
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeOnePieceSets.ts
 *   node --import tsx/esm scripts/scrapeOnePieceSets.ts --dry-run
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
loadEnvFilesFromRepoRoot(import.meta.url);

const REPO_ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const SETS_DATA_DIR = path.join(REPO_ROOT, "onepiece", "sets", "data");
const SETS_IMAGES_DIR = path.join(REPO_ROOT, "onepiece", "sets", "images");
const SETS_FILE = path.join(SETS_DATA_DIR, "sets.json");

const SCRYDEX_EXPANSIONS_URL = "https://scrydex.com/onepiece/expansions";
const TCGPLAYER_CATEGORY_URL =
  "https://www.tcgplayer.com/categories/trading-and-collectible-card-games/one-piece-card-game";

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
  /** TCGPlayer group/set id numeric string, e.g. "3188" */
  tcgplayerId: string | null;
  /** TCGPlayer URL slug for this set, e.g. "romance-dawn" */
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

// ──────────────────────────────────────────────────────────────────────────────
// TCGPlayer — fetch set IDs via the mp-search-api
// ──────────────────────────────────────────────────────────────────────────────

type TcgPlayerSet = {
  tcgplayerId: string;
  /** The URL slug used in TCGPlayer's search API, e.g. "romance-dawn" */
  tcgplayerUrlSlug: string;
  name: string;
  setCode: string | null;
  releaseDate: string | null;
  cardCount: number | null;
};

type SearchApiResponse = {
  results?: Array<{
    results?: Array<{
      setId?: number;
      setName?: string;
      setUrlName?: string;
      productLineId?: number;
    }>;
    aggregations?: {
      setName?: Array<{ urlValue: string; value: string; count: number }>;
    };
  }>;
  aggregations?: {
    setName?: Array<{ urlValue: string; value: string; count: number }>;
  };
};

/**
 * Step 1: Get all set name slugs from the TCGPlayer search aggregations.
 * Step 2: For each slug, fetch one card to get the numeric setId.
 */
async function fetchTcgPlayerSetsFromSearchApi(): Promise<TcgPlayerSet[]> {
  const SEARCH_URL = "https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false";

  // ── Step 1: get set aggregations ──
  let setAggs: Array<{ urlValue: string; value: string }> = [];
  try {
    const aggsBody = JSON.stringify({
      algorithm: "revenue_desc",
      from: 0,
      size: 0,
      filters: {
        term: { productLineName: ["One Piece Card Game"] },
        range: {},
        match: {},
      },
      aggregations: ["setName"],
      context: { shippingCountry: "US", cart: {} },
      settings: { useFuzzySearch: true, didYouMean: {} },
    });
    const data = await postJson(SEARCH_URL, aggsBody) as SearchApiResponse;
    const aggs =
      data.aggregations?.setName ??
      data.results?.[0]?.aggregations?.setName ??
      [];
    setAggs = aggs.map((a) => ({ urlValue: a.urlValue, value: a.value }));
  } catch (err) {
    console.warn(
      `  [TCGPlayer search aggs] Failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (setAggs.length === 0) return [];
  console.log(`  Found ${setAggs.length} set slugs from TCGPlayer search aggregations.`);

  // ── Step 2: fetch one product per set to get numeric setId ──
  const results: TcgPlayerSet[] = [];

  for (const agg of setAggs) {
    try {
      const body = JSON.stringify({
        algorithm: "revenue_desc",
        from: 0,
        size: 1,
        filters: {
          term: {
            productLineName: ["One Piece Card Game"],
            setName: [agg.value],
          },
          range: {},
          match: {},
        },
        context: { shippingCountry: "US", cart: {} },
        settings: { useFuzzySearch: false, didYouMean: {} },
      });

      const res = await postJson(SEARCH_URL, body);
      const data = res as SearchApiResponse;
      const items = data.results?.[0]?.results ?? [];

      if (items.length === 0) {
        console.warn(`    [TCGPlayer] No products found for set: ${agg.value}`);
        results.push({
          tcgplayerId: "",
          tcgplayerUrlSlug: agg.urlValue,
          name: agg.value,
          setCode: extractSetCode(agg.value),
          releaseDate: null,
          cardCount: null,
        });
        continue;
      }

      // Validate the returned setName matches what we queried — some sets return wrong results
      // when exact-filter match fails (e.g. "Premium Booster -The Best-" returns "Royal Blood")
      const matchingItem = items.find((item) =>
        normaliseName(item.setName ?? "") === normaliseName(agg.value),
      ) ?? items[0];

      const returnedSetName = matchingItem.setName ?? "";
      if (normaliseName(returnedSetName) !== normaliseName(agg.value)) {
        // Wrong set returned — try a free-text query with the set name
        console.warn(`    [TCGPlayer] setName mismatch for "${agg.value}" (got "${returnedSetName}"), retrying with free-text...`);
        const freeTextData = await postJson(
          SEARCH_URL.replace("q=", `q=${encodeURIComponent(agg.value)}`),
          JSON.stringify({
            algorithm: "revenue_desc", from: 0, size: 5,
            filters: { term: { productLineName: ["One Piece Card Game"] }, range: {}, match: {} },
            context: { shippingCountry: "US", cart: {} },
            settings: { useFuzzySearch: true, didYouMean: {} },
          }),
        ) as SearchApiResponse;
        const freeItems = freeTextData.results?.[0]?.results ?? [];
        const exactMatch = freeItems.find((item) =>
          normaliseName(item.setName ?? "") === normaliseName(agg.value),
        );
        if (exactMatch?.setId != null) {
          const tcgplayerId = String(Math.round(exactMatch.setId));
          const codeMatch = agg.value.match(/\b(OP\d{2}|ST\d{2}|EB\d{2}|PRB\d+)\b/i);
          results.push({
            tcgplayerId,
            tcgplayerUrlSlug: agg.urlValue,
            name: exactMatch.setName ?? agg.value,
            setCode: codeMatch ? codeMatch[1].toUpperCase() : extractSetCode(agg.value),
            releaseDate: null,
            cardCount: null,
          });
          console.log(`    ${agg.value} → setId: ${tcgplayerId} (free-text)`);
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        console.warn(`    [TCGPlayer] Could not resolve setId for: ${agg.value}`);
        results.push({
          tcgplayerId: "",
          tcgplayerUrlSlug: agg.urlValue,
          name: agg.value,
          setCode: extractSetCode(agg.value),
          releaseDate: null,
          cardCount: null,
        });
        continue;
      }

      const tcgplayerId = matchingItem.setId != null ? String(Math.round(matchingItem.setId)) : "";
      const codeMatch = agg.value.match(/\b(OP\d{2}|ST\d{2}|EB\d{2}|PRB\d+)\b/i);

      results.push({
        tcgplayerId,
        tcgplayerUrlSlug: agg.urlValue,
        name: matchingItem.setName ?? agg.value,
        setCode: codeMatch ? codeMatch[1].toUpperCase() : extractSetCode(agg.value),
        releaseDate: null,
        cardCount: null,
      });

      console.log(`    ${agg.value} → setId: ${tcgplayerId}`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      console.warn(
        `    [TCGPlayer] Failed for ${agg.value}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Retry once after a longer pause
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const retryData = await postJson(
          SEARCH_URL,
          JSON.stringify({
            algorithm: "revenue_desc", from: 0, size: 1,
            filters: { term: { productLineName: ["One Piece Card Game"], setName: [agg.value] }, range: {}, match: {} },
            context: { shippingCountry: "US", cart: {} },
            settings: { useFuzzySearch: false, didYouMean: {} },
          }),
        ) as SearchApiResponse;
        const retryItems = retryData.results?.[0]?.results ?? [];
        if (retryItems.length > 0 && retryItems[0].setId != null) {
          const tcgplayerId = String(Math.round(retryItems[0].setId));
          const codeMatch = agg.value.match(/\b(OP\d{2}|ST\d{2}|EB\d{2}|PRB\d+)\b/i);
          results.push({
            tcgplayerId,
            tcgplayerUrlSlug: agg.urlValue,
            name: retryItems[0].setName ?? agg.value,
            setCode: codeMatch ? codeMatch[1].toUpperCase() : extractSetCode(agg.value),
            releaseDate: null,
            cardCount: null,
          });
          console.log(`    ${agg.value} → setId: ${tcgplayerId} (retry)`);
        }
      } catch (retryErr) {
        console.warn(`    [TCGPlayer] Retry also failed for ${agg.value}`);
      }
    }
  }

  return results;
}

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

// ──────────────────────────────────────────────────────────────────────────────
// Normalise set code from a name string
// ──────────────────────────────────────────────────────────────────────────────

function extractSetCode(name: string): string | null {
  // Match OP01-OP15, ST01+, EB01, PRB01, etc.
  const m = name.match(/\b((?:OP|ST|EB|PRB?|OPCG)\d+)\b/i);
  return m ? m[1].toUpperCase() : null;
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
    if (!DRY_RUN) {
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
    await uploadLocalFileToOnePieceR2(s3, destPath, `sets/images/${filename}`);
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

  // ── 2. TCGPlayer ────────────────────────────────────────────────────────────
  console.log("\nFetching TCGPlayer One Piece sets via search API...");

  let tcgSets: TcgPlayerSet[] = [];
  try {
    tcgSets = await fetchTcgPlayerSetsFromSearchApi();
  } catch (err) {
    console.warn(`  [TCGPlayer] Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`  Found ${tcgSets.length} sets from TCGPlayer.`);

  // Helper to normalise a name for fuzzy matching
  function normaliseName(n: string): string {
    return n.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  for (const ts of tcgSets) {
    // Skip auxiliary TCGPlayer-only sets (pre-release, promo, event, super pre-release, demo, revision, collection)
    const isAuxiliary =
      /pre.?release/i.test(ts.name) ||
      /super pre.?release/i.test(ts.name) ||
      /demo deck/i.test(ts.name) ||
      /revision pack/i.test(ts.name) ||
      /release event/i.test(ts.name) ||
      /collection sets/i.test(ts.name) ||
      /promotion cards/i.test(ts.name) ||
      /tournament cards/i.test(ts.name) ||
      /anniversary tournament/i.test(ts.name) ||
      /learn together/i.test(ts.name) ||
      // "Starter Deck 29: Egghead" = EB04 on Scrydex — handled via MANUAL_TCG_IDS override
      /^starter deck 29:/i.test(ts.name);

    if (isAuxiliary) {
      console.log(`  [TCGPlayer] Skipping auxiliary set: ${ts.name} (${ts.tcgplayerId})`);
      continue;
    }

    // Determine canonical set code — match against Scrydex sets first
    let matchedSet: OnePieceSet | undefined;

    // 1. Exact slug match (scrydexId === tcgplayerUrlSlug)
    matchedSet = [...sets.values()].find((s) => s.scrydexId === ts.tcgplayerUrlSlug);

    // 2. Normalised name match (strip date suffix from Scrydex names like "Romance Dawn 2022/12/02")
    if (!matchedSet) {
      const normTcg = normaliseName(ts.name);
      matchedSet = [...sets.values()].find(
        (s) => normaliseName(s.name.replace(/\s*\d{4}\/\d{2}\/\d{2}$/, "")) === normTcg,
      );
    }

    // 3. Slug cross-match: TCGPlayer urlSlug vs Scrydex slug
    if (!matchedSet) {
      matchedSet = [...sets.values()].find((s) => {
        if (!s.scrydexId) return false;
        const scrydexNorm = normaliseName(s.scrydexId.replace(/-/g, ""));
        const tcgNorm = normaliseName(ts.tcgplayerUrlSlug.replace(/-/g, ""));
        return scrydexNorm === tcgNorm;
      });
    }

    // 4 & 5. TCGPlayer "Starter Deck N: {subtitle}" or "Extra Booster: {subtitle}" → match Scrydex by subtitle
    if (!matchedSet &&
      (/^starter deck\s+(?:ex:?|\d+):/i.test(ts.name) || /^extra booster:/i.test(ts.name))
    ) {
      const subtitle = ts.name
        .replace(/^(?:extra booster|starter deck\s+(?:ex:?|\d+)):\s*/i, "")
        .trim();
      const normSub = normaliseName(subtitle);

      // a) Exact: scrydexId normalised === subtitle normalised
      matchedSet = [...sets.values()].find((s) => {
        if (!s.scrydexId) return false;
        return normaliseName(s.scrydexId.replace(/-/g, "")) === normSub;
      });

      // b) Scrydex slug is a prefix of the subtitle (e.g. "animalkingdom" ⊂ "animalkingdompirates")
      if (!matchedSet) {
        matchedSet = [...sets.values()].find((s) => {
          if (!s.scrydexId) return false;
          const scrydexNorm = normaliseName(s.scrydexId.replace(/-/g, ""));
          return normSub.startsWith(scrydexNorm) && scrydexNorm.length >= 5;
        });
      }

      // c) Subtitle is a suffix of scrydexId (e.g. "filmedition" suffix of "onepiecefilmedition")
      if (!matchedSet) {
        matchedSet = [...sets.values()].find((s) => {
          if (!s.scrydexId) return false;
          const scrydexNorm = normaliseName(s.scrydexId.replace(/-/g, ""));
          return scrydexNorm.endsWith(normSub) && normSub.length >= 5;
        });
      }

      // d) Subtitle contains scrydex slug (e.g. "heroinesedition" ⊂ "onepieceheroinesedition")
      if (!matchedSet) {
        matchedSet = [...sets.values()].find((s) => {
          if (!s.scrydexId) return false;
          const scrydexNorm = normaliseName(s.scrydexId.replace(/-/g, ""));
          return normSub.includes(scrydexNorm) && scrydexNorm.length >= 6;
        });
      }
    }

    // 6. TCGPlayer "Premium Booster -The Best- Vol. N" → match Scrydex "the-best" (PRB01)
    if (!matchedSet && /premium booster/i.test(ts.name)) {
      // Extract the key part: "-The Best-" → "thebest"
      const inner = ts.name.replace(/^premium booster\s*/i, "").replace(/[-–—]/g, " ").replace(/\s*vol\.?\s*\d+/i, "").trim();
      const normInner = normaliseName(inner);
      matchedSet = [...sets.values()].find((s) => {
        if (!s.scrydexId) return false;
        const scrydexNorm = normaliseName(s.scrydexId.replace(/-/g, ""));
        return scrydexNorm === normInner || scrydexNorm.startsWith(normInner) || normInner.includes(scrydexNorm);
      });
    }

    // 7. Direct slug URL match: TCGPlayer urlSlug == Scrydex slug (e.g. "royal-blood" == "royal-blood")
    if (!matchedSet) {
      matchedSet = [...sets.values()].find((s) => s.scrydexId === ts.tcgplayerUrlSlug);
    }

    let code: string;
    if (matchedSet) {
      code = matchedSet.setCode;
    } else {
      // No match — either a new set or use code from name
      code =
        ts.setCode ??
        extractSetCode(ts.name) ??
        ts.name.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8);
      console.log(`  [TCGPlayer] No Scrydex match for: ${ts.name} → code: ${code}`);
    }

    mergeIntoSets(sets, nextId, code, {
      name: matchedSet?.name ?? ts.name,
      releaseDate: ts.releaseDate,
      cardCount: ts.cardCount,
      tcgplayerId: ts.tcgplayerId || undefined,
      tcgplayerUrlSlug: ts.tcgplayerUrlSlug,
    } as Partial<OnePieceSet>);
  }

  // ── 3. Post-process: rename sets whose code couldn't be determined automatically ──
  //
  // Rename sets whose code couldn't be determined automatically from source data.
  // OP15 is on Scrydex (e.g. adventure-on-kamis-island); this fixes legacy TCGPlayer rows
  // that used a truncated code before merge with the Scrydex expansion list.
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

  // Manual TCGPlayer ID overrides for sets where the search API returns wrong results
  // or where TCGPlayer uses a different set name than Scrydex.
  const MANUAL_TCG_IDS: Record<string, { tcgplayerId: string; tcgplayerUrlSlug: string }> = {
    // PRB01: TCGPlayer search returns wrong set for exact-match query; free-text resolves to 23496
    PRB01: { tcgplayerId: "23496", tcgplayerUrlSlug: "premium-booster-the-best" },
    // EB04: TCGPlayer calls this "Starter Deck 29: Egghead" (setId 24575)
    EB04: { tcgplayerId: "24575", tcgplayerUrlSlug: "starter-deck-29-egghead" },
  };
  for (const [code, override] of Object.entries(MANUAL_TCG_IDS)) {
    const existing = sets.get(code);
    if (existing && !existing.tcgplayerId) {
      existing.tcgplayerId = override.tcgplayerId;
      existing.tcgplayerUrlSlug = override.tcgplayerUrlSlug;
    }
  }

  // Sort sets by release date then code
  const sortedSets = [...sets.values()].sort((a, b) => {
    const aDate = a.releaseDate ? Date.parse(a.releaseDate) : 0;
    const bDate = b.releaseDate ? Date.parse(b.releaseDate) : 0;
    if (aDate !== bDate) return aDate - bDate;
    return a.setCode.localeCompare(b.setCode);
  });

  // ── 4. Download images ──────────────────────────────────────────────────────
  console.log("\nDownloading set images...");
  for (const set of sortedSets) {
    if (set.imageUrl) {
      set.imagePath = await downloadSetImage(set, s3);
      await new Promise((r) => setTimeout(r, 200));
    } else {
      console.log(`  [image] no image for ${set.setCode}`);
    }
  }

  // ── 5. Write output ─────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    fs.writeFileSync(SETS_FILE, JSON.stringify(sortedSets, null, 2) + "\n");
    await uploadLocalFileToOnePieceR2(s3, SETS_FILE, "sets/data/sets.json");
    console.log(`\nWrote ${sortedSets.length} sets to ${SETS_FILE}`);
  }

  // ── 6. Summary ──────────────────────────────────────────────────────────────
  console.log("\n── Set Summary ──────────────────────────────────────────");
  console.log(`${"Code".padEnd(10)} ${"Scrydex ID".padEnd(30)} ${"TCGPlayer ID".padEnd(14)} ${"Cards".padEnd(6)} ${"Release".padEnd(12)} Name`);
  console.log("─".repeat(110));
  for (const set of sortedSets) {
    console.log(
      `${set.setCode.padEnd(10)} ${(set.scrydexId ?? "—").padEnd(30)} ${(set.tcgplayerId ?? "—").padEnd(14)} ${String(set.cardCount ?? "?").padEnd(6)} ${(set.releaseDate ?? "unknown").padEnd(12)} ${set.name}`,
    );
  }
  console.log(`\nTotal: ${sortedSets.length} sets`);
  const missingImage = sortedSets.filter((s) => !s.imageUrl);
  if (missingImage.length > 0) {
    console.log(`\nSets missing images: ${missingImage.map((s) => s.setCode).join(", ")}`);
  }
  const missingTcg = sortedSets.filter((s) => !s.tcgplayerId);
  if (missingTcg.length > 0) {
    console.log(`Sets missing TCGPlayer ID: ${missingTcg.map((s) => s.setCode).join(", ")}`);
  }
  const missingScrydex = sortedSets.filter((s) => !s.scrydexId);
  if (missingScrydex.length > 0) {
    console.log(`Sets missing Scrydex ID: ${missingScrydex.map((s) => s.setCode).join(", ")}`);
  }
}

await main();
