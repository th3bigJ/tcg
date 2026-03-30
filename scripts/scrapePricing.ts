/**
 * Scrape Scrydex pricing for all sets, a specific set, or a specific series.
 * Reads card data from data/cards/{setCode}.json, writes results to R2 as pricing/{setCode}.json.
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapePricing.ts
 *   node --import tsx/esm scripts/scrapePricing.ts --dry-run
 *   node --import tsx/esm scripts/scrapePricing.ts --set=sv1
 *   node --import tsx/esm scripts/scrapePricing.ts --set=sv1,sv2
 *   node --import tsx/esm scripts/scrapePricing.ts --series="Scarlet & Violet"
 */

import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { CardJsonEntry, SetJsonEntry, SeriesJsonEntry, SetPricingMap } from "../lib/staticDataTypes";
import {
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPrices,
  parseScrydexExpansionListPaths,
  resolveScrydexListUsd,
  resolveScrydexCardPath,
} from "../lib/scrydexExpansionListParsing";
import {
  fetchScrydexCardPageHtml,
  parseScrydexCardPageRawNearMintUsd,
  parseScrydexCardPagePsa10Usd,
  parseScrydexCardPageAce10Usd,
  mergeScrydexExpansionAndDetailUsd,
  canonicalScrydexVariantLabel,
  SCRYDEX_FLAT_PSA10_KEY_SUFFIX,
  SCRYDEX_FLAT_ACE10_KEY_SUFFIX,
} from "../lib/scrydexMepCardPagePricing";
import { scrydexMegaExpansionConfig } from "../lib/scrydexMegaEvolutionUrls";
import { scrydexScarletVioletExpansionConfig } from "../lib/scrydexScarletVioletUrls";
import { lookupScrydexBulkExpansionConfig } from "../lib/scrydexBulkExpansionUrls";
import type { ScrydexExpansionListConfig } from "../lib/scrydexMegaEvolutionUrls";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes("--dry-run");

const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

const seriesArg = process.argv.find((a) => a.startsWith("--series="));
const onlySeriesNames = seriesArg
  ? seriesArg.slice("--series=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

// ─── Static data ──────────────────────────────────────────────────────────────

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");

function loadSets(): SetJsonEntry[] {
  return readJson<SetJsonEntry[]>(path.join(DATA_DIR, "sets.json"));
}

function loadSeries(): SeriesJsonEntry[] {
  return readJson<SeriesJsonEntry[]>(path.join(DATA_DIR, "series.json"));
}

function loadCardsForSet(setCode: string): CardJsonEntry[] {
  const file = path.join(CARDS_DIR, `${setCode}.json`);
  if (!fs.existsSync(file)) return [];
  return readJson<CardJsonEntry[]>(file);
}

// ─── Expansion URL resolution ─────────────────────────────────────────────────

function resolveExpansionConfig(set: SetJsonEntry): ScrydexExpansionListConfig | null {
  const code = set.code ?? undefined;
  const tcgdexId = set.tcgdexId ?? undefined;
  const candidates = [code, tcgdexId].filter((x): x is string => Boolean(x?.trim()));
  for (const c of candidates) {
    const r = scrydexMegaExpansionConfig(c, undefined, undefined);
    if (r) return r;
  }
  for (const c of candidates) {
    const r = scrydexScarletVioletExpansionConfig(c, undefined, undefined);
    if (r) return r;
  }
  for (const c of candidates) {
    const r = lookupScrydexBulkExpansionConfig(c, undefined, undefined);
    if (r) return r;
  }
  return null;
}

function resolveExpansionConfigs(set: SetJsonEntry): ScrydexExpansionListConfig[] {
  const code = (set.code ?? set.tcgdexId ?? "").trim().toLowerCase();
  if (code === "swsh12.5") {
    return [
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/crown-zenith/swsh12pt5",
        listPrefix: "swsh12pt5",
      },
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/crown-zenith-galarian-gallery/swsh12pt5gg",
        listPrefix: "swsh12pt5gg",
      },
    ];
  }
  if (code === "swsh4.5") {
    return [
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/shining-fates/swsh45",
        listPrefix: "swsh45",
      },
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/shining-fates-shiny-vault/swsh45sv",
        listPrefix: "swsh45sv",
      },
    ];
  }

  const cfg = resolveExpansionConfig(set);
  return cfg ? [cfg] : [];
}

// ─── Pricing helpers ──────────────────────────────────────────────────────────

type ByVariant = Record<string, { raw?: number; psa10?: number; ace10?: number }>;

function slugFromLabel(label: string): string {
  const compact = label.toLowerCase().replace(/[\s-_]+/g, "");
  if (compact === "default") return "default";
  if (compact === "holofoil") return "holofoil";
  if (compact === "reverseholofoil") return "reverseHolofoil";
  if (compact === "staffstamp") return "staffStamp";
  const parts = label.split(/\s+/).filter(Boolean);
  if (!parts.length) return label.toLowerCase();
  return (
    parts[0].toLowerCase() +
    parts
      .slice(1)
      .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
      .join("")
  );
}

function collateFlatToByVariant(flatUsd: Record<string, number>): ByVariant {
  const out: ByVariant = {};
  for (const [k, v] of Object.entries(flatUsd)) {
    if (!Number.isFinite(v)) continue;
    if (k.endsWith(SCRYDEX_FLAT_PSA10_KEY_SUFFIX)) {
      const base = k.slice(0, -SCRYDEX_FLAT_PSA10_KEY_SUFFIX.length);
      const slug = slugFromLabel(canonicalScrydexVariantLabel(base));
      out[slug] = { ...out[slug], psa10: v };
    } else if (k.endsWith(SCRYDEX_FLAT_ACE10_KEY_SUFFIX)) {
      const base = k.slice(0, -SCRYDEX_FLAT_ACE10_KEY_SUFFIX.length);
      const slug = slugFromLabel(canonicalScrydexVariantLabel(base));
      out[slug] = { ...out[slug], ace10: v };
    } else {
      const slug = slugFromLabel(canonicalScrydexVariantLabel(k));
      out[slug] = { ...out[slug], raw: v };
    }
  }
  return out;
}

function convertByVariantUsdToGbp(byVariant: ByVariant, usdToGbp: number): ByVariant {
  const out: ByVariant = {};
  for (const [slug, rec] of Object.entries(byVariant)) {
    const next: { raw?: number; psa10?: number; ace10?: number } = {};
    if (typeof rec.raw === "number") next.raw = rec.raw * usdToGbp;
    if (typeof rec.psa10 === "number") next.psa10 = rec.psa10 * usdToGbp;
    if (typeof rec.ace10 === "number") next.ace10 = rec.ace10 * usdToGbp;
    if (Object.keys(next).length > 0) out[slug] = next;
  }
  return out;
}

// ─── FX rates ─────────────────────────────────────────────────────────────────

async function fetchUsdToGbp(): Promise<number> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=GBP&to=USD");
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const data = (await res.json()) as { rates?: { USD?: number } };
    const usdPerGbp = data.rates?.USD;
    if (!usdPerGbp || usdPerGbp <= 0) throw new Error("Bad rate");
    return 1 / usdPerGbp;
  } catch {
    const fallback = Number.parseFloat(process.env.MARKET_PRICE_FALLBACK_USD_TO_GBP ?? "0.79");
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0.79;
  }
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
}

// ─── R2 upload ────────────────────────────────────────────────────────────────

function buildS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT ?? "",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
    region: process.env.R2_REGION ?? "auto",
  });
}

async function uploadToR2(s3: S3Client, setCode: string, json: string): Promise<void> {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `pricing/${setCode}.json`,
      Body: json,
      ContentType: "application/json",
    }),
  );
}

// ─── Per-set scrape ───────────────────────────────────────────────────────────

async function scrapeSet(
  set: SetJsonEntry,
  cards: CardJsonEntry[],
  usdToGbp: number,
  s3: S3Client,
): Promise<void> {
  const setCode = set.code ?? set.tcgdexId;
  if (!setCode) return;

  const configs = resolveExpansionConfigs(set);
  if (!configs.length) {
    console.log(`  [${setCode}] skip — no Scrydex URL mapped`);
    return;
  }

  const tcgPrefixes = [set.code, set.tcgdexId].filter((x): x is string => Boolean(x?.trim()));
  const perConfig = new Map<string, { priceMap: Map<string, Record<string, number>>; pathMap: Map<string, string> }>();
  const pathsNeeded = new Set<string>();

  for (const cfg of configs) {
    console.log(`  [${setCode}] fetching expansion listing (${cfg.listPrefix})…`);
    let expansionHtml: string;
    try {
      expansionHtml = await fetchScrydexExpansionMultiPageHtml(cfg.expansionUrl);
    } catch (e) {
      console.log(`  [${setCode}] expansion fetch failed for ${cfg.listPrefix}: ${e instanceof Error ? e.message : "error"}`);
      continue;
    }

    const priceMap = parseScrydexExpansionListPrices(expansionHtml, cfg.listPrefix);
    const pathMap = parseScrydexExpansionListPaths(expansionHtml, cfg.listPrefix);
    perConfig.set(cfg.listPrefix, { priceMap, pathMap });
    console.log(`  [${setCode}] ${priceMap.size} tiles from expansion listing (${cfg.listPrefix})`);

    for (const card of cards) {
      const ext = (card.tcgdex_id ?? card.externalId ?? "").trim().toLowerCase();
      if (!ext) continue;
      const p = resolveScrydexCardPath(pathMap, ext, cfg.listPrefix, tcgPrefixes);
      if (p) pathsNeeded.add(p);
    }
  }

  if (!perConfig.size) return;

  const conc = Number.parseInt(process.env.SCRYDEX_CARD_PAGE_CONCURRENCY ?? "20", 10);
  console.log(`  [${setCode}] fetching ${pathsNeeded.size} card detail pages (concurrency=${conc})…`);
  const pathHtml = new Map<string, string>();
  let fetched = 0;
  const total = pathsNeeded.size;
  await mapPool([...pathsNeeded], conc, async (p) => {
    try {
      pathHtml.set(p, await fetchScrydexCardPageHtml(p));
    } catch {
      pathHtml.set(p, "");
    }
    fetched++;
    if (fetched % 50 === 0 || fetched === total) {
      process.stdout.write(`\r  [${setCode}] fetched ${fetched}/${total} card pages…`);
    }
  });
  if (total > 0) console.log();

  // Build pricing map
  const pricingMap: SetPricingMap = {};
  for (const card of cards) {
    const ext = (card.tcgdex_id ?? card.externalId ?? "").trim().toLowerCase();
    if (!ext) continue;

    let flatUsd: Record<string, number> = {};
    for (const cfg of configs) {
      const entry = perConfig.get(cfg.listPrefix);
      if (!entry) continue;
      const listUsd = resolveScrydexListUsd(entry.priceMap, ext, cfg.listPrefix, tcgPrefixes);
      const cardPath = resolveScrydexCardPath(entry.pathMap, ext, cfg.listPrefix, tcgPrefixes);
      const html = cardPath ? (pathHtml.get(cardPath) ?? "") : "";
      const detailUsd = html ? parseScrydexCardPageRawNearMintUsd(html) : {};
      const psa10Usd = html ? parseScrydexCardPagePsa10Usd(html) : {};
      const ace10Usd = html ? parseScrydexCardPageAce10Usd(html) : {};
      flatUsd = {
        ...flatUsd,
        ...mergeScrydexExpansionAndDetailUsd(listUsd, detailUsd),
        ...psa10Usd,
        ...ace10Usd,
      };
    }
    const byVariant = collateFlatToByVariant(flatUsd);
    const hasPrice = Object.values(byVariant).some((r) => Number.isFinite(r.raw) || Number.isFinite(r.psa10) || Number.isFinite(r.ace10));
    if (!hasPrice) continue;

    const scrydexGbp = convertByVariantUsdToGbp(byVariant, usdToGbp);
    const key = card.externalId ?? ext;
    pricingMap[key] = { scrydex: scrydexGbp, tcgplayer: null, cardmarket: null };
  }

  const count = Object.keys(pricingMap).length;
  const json = JSON.stringify(pricingMap);

  if (dryRun) {
    console.log(`  [${setCode}] ${count} priced cards (dry-run — skipping R2 upload)`);
  } else {
    await uploadToR2(s3, setCode, json);
    console.log(`  [${setCode}] ${count} priced cards → R2 pricing/${setCode}.json`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load .env.local
  const envFile = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m) process.env[m[1].trim()] ??= m[2].trim();
    }
  }

  const allSets = loadSets();
  let sets = allSets;

  if (onlySetCodes?.length) {
    const allowed = new Set(onlySetCodes.map((s) => s.toLowerCase()));
    sets = allSets.filter(
      (s) =>
        (s.code && allowed.has(s.code.toLowerCase())) ||
        (s.tcgdexId && allowed.has(s.tcgdexId.toLowerCase())),
    );
    if (!sets.length) throw new Error(`No sets found matching: ${onlySetCodes.join(", ")}`);
  } else if (onlySeriesNames?.length) {
    const allSeries = loadSeries();
    const matchedSeries = new Set(
      allSeries
        .filter((sr) => onlySeriesNames.some((n) => n.toLowerCase() === sr.name.toLowerCase()))
        .map((sr) => sr.name),
    );
    if (!matchedSeries.size) throw new Error(`No series found matching: ${onlySeriesNames.join(", ")}`);
    sets = allSets.filter((s) => s.seriesName && matchedSeries.has(s.seriesName));
    if (!sets.length) throw new Error(`No sets found in series: ${[...matchedSeries].join(", ")}`);
  }

  const scopeLabel = onlySetCodes?.length
    ? `sets: ${onlySetCodes.join(", ")}`
    : onlySeriesNames?.length
      ? `series: ${onlySeriesNames.join(", ")}`
      : "all sets";

  console.log(`=== Scrydex price scrape (${scopeLabel}) ===`);
  if (dryRun) console.log("(dry-run: no R2 uploads)\n");

  const usdToGbp = await fetchUsdToGbp();
  console.log(`FX: 1 USD = ${usdToGbp.toFixed(4)} GBP\n`);

  const s3 = buildS3Client();

  for (const set of sets) {
    const setCode = set.code ?? set.tcgdexId;
    if (!setCode) continue;
    const cards = loadCardsForSet(setCode);
    if (!cards.length) {
      console.log(`  [${setCode}] skip — no cards in data/cards/${setCode}.json`);
      continue;
    }
    await scrapeSet(set, cards, usdToGbp, s3);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
