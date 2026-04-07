import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2SinglesCardPricingPrefix } from "@/lib/r2BucketLayout";
import type { CardJsonEntry, SetJsonEntry, SeriesJsonEntry, SetPricingMap } from "../staticDataTypes";
import { updatePriceHistory } from "../r2PriceHistory";
import { uploadPriceTrends } from "../r2PriceTrends";
import {
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPrices,
  parseScrydexExpansionListPaths,
  resolveScrydexListUsd,
  resolveScrydexCardPath,
} from "../scrydexExpansionListParsing";
import {
  fetchScrydexCardPageHtml,
  parseScrydexCardPageRawNearMintUsd,
  parseScrydexCardPagePsa10Usd,
  parseScrydexCardPageAce10Usd,
  mergeScrydexExpansionAndDetailUsd,
  canonicalScrydexVariantLabel,
  SCRYDEX_FLAT_PSA10_KEY_SUFFIX,
  SCRYDEX_FLAT_ACE10_KEY_SUFFIX,
} from "../scrydexMepCardPagePricing";
import { resolveExpansionConfigsForSet } from "../scrydexExpansionConfigsForSet";
import { getSinglesCatalogSetKey } from "../singlesCatalogSetKey";
import { buildScrydexPrefixCandidates, setRowMatchesAllowedSetCodes } from "../scrydexPrefixCandidatesForSet";

export interface ScrapePricingOptions {
  dryRun?: boolean;
  onlySetCodes?: string[];
  onlySeriesNames?: string[];
}

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
      Key: `${r2SinglesCardPricingPrefix}/${setCode}.json`,
      Body: json,
      ContentType: "application/json",
    }),
  );
}

// ─── Per-set scrape ───────────────────────────────────────────────────────────

async function scrapeSet(set: SetJsonEntry, cards: CardJsonEntry[], s3: S3Client, dryRun: boolean): Promise<void> {
  const setCode = getSinglesCatalogSetKey(set);
  if (!setCode) return;

  const configs = resolveExpansionConfigsForSet(set);
  if (!configs.length) {
    console.log(`  [${setCode}] skip — no Scrydex URL mapped`);
    return;
  }

  const tcgPrefixes = buildScrydexPrefixCandidates(set);
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
      const ext = (card.externalId ?? "").trim().toLowerCase();
      if (!ext) continue;
      const p = resolveScrydexCardPath(pathMap, ext, cfg.listPrefix, tcgPrefixes);
      if (p) pathsNeeded.add(p);
    }
  }

  if (!perConfig.size) return;

  const conc = Number.parseInt(process.env.SCRYDEX_CARD_PAGE_CONCURRENCY ?? "20", 10);
  console.log(`  [${setCode}] fetching ${pathsNeeded.size} card detail pages (concurrency=${conc})…`);
  const pathHtml = new Map<string, string>();
  const normalVariantPathHtml = new Map<string, string>();
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
    const ext = (card.externalId ?? "").trim().toLowerCase();
    if (!ext) continue;

    let flatUsd: Record<string, number> = {};
    for (const cfg of configs) {
      const entry = perConfig.get(cfg.listPrefix);
      if (!entry) continue;
      const listUsd = resolveScrydexListUsd(entry.priceMap, ext, cfg.listPrefix, tcgPrefixes);
      const cardPath = resolveScrydexCardPath(entry.pathMap, ext, cfg.listPrefix, tcgPrefixes);
      let html = cardPath ? (pathHtml.get(cardPath) ?? "") : "";
      let detailUsd = html ? parseScrydexCardPageRawNearMintUsd(html) : {};
      let psa10Usd = html ? parseScrydexCardPagePsa10Usd(html) : {};
      let ace10Usd = html ? parseScrydexCardPageAce10Usd(html) : {};

      if (
        cardPath &&
        Object.keys(detailUsd).length === 0 &&
        Object.keys(psa10Usd).length === 0 &&
        Object.keys(ace10Usd).length === 0
      ) {
        let normalHtml = normalVariantPathHtml.get(cardPath) ?? "";
        if (!normalVariantPathHtml.has(cardPath)) {
          try {
            normalHtml = await fetchScrydexCardPageHtml(cardPath, "normal");
          } catch {
            normalHtml = "";
          }
          normalVariantPathHtml.set(cardPath, normalHtml);
        }
        if (normalHtml) {
          html = normalHtml;
          detailUsd = parseScrydexCardPageRawNearMintUsd(html);
          psa10Usd = parseScrydexCardPagePsa10Usd(html);
          ace10Usd = parseScrydexCardPageAce10Usd(html);
        }
      }

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

    const key = (card.externalId ?? ext).trim().toLowerCase();
    pricingMap[key] = { scrydex: byVariant, tcgplayer: null, cardmarket: null };
  }

  const count = Object.keys(pricingMap).length;
  const json = JSON.stringify(pricingMap);

  if (dryRun) {
    console.log(`  [${setCode}] ${count} priced cards (dry-run — skipping R2 upload)`);
  } else {
    await uploadToR2(s3, setCode, json);
    const historyMap = await updatePriceHistory(s3, setCode, pricingMap);
    await uploadPriceTrends(s3, setCode, historyMap);
    console.log(`  [${setCode}] ${count} priced cards → R2 ${r2SinglesCardPricingPrefix}/${setCode}.json`);
  }
}

// ─── Exported job function ────────────────────────────────────────────────────

export async function runScrapePricing(opts: ScrapePricingOptions = {}): Promise<void> {
  const { dryRun = false, onlySetCodes, onlySeriesNames } = opts;

  const allSets = loadSets();
  let sets = allSets;

  if (onlySetCodes?.length) {
    sets = allSets.filter((s) => setRowMatchesAllowedSetCodes(s, onlySetCodes));
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

  console.log(`=== Scrydex price scrape (${scopeLabel}) — storing USD ===`);
  if (dryRun) console.log("(dry-run: no R2 uploads)\n");

  const s3 = buildS3Client();

  for (const set of sets) {
    const setCode = getSinglesCatalogSetKey(set);
    if (!setCode) continue;
    const cards = loadCardsForSet(setCode);
    if (!cards.length) {
      console.log(`  [${setCode}] skip — no cards in data/cards/${setCode}.json`);
      continue;
    }
    await scrapeSet(set, cards, s3, dryRun);
  }

  console.log("\nDone.");
}
