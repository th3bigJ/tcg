import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type {
  CardJsonEntry,
  ScrydexCardPricing,
  SeriesJsonEntry,
  SetJsonEntry,
  SetPricingMap,
} from "./staticDataTypes";
import { updatePriceHistory } from "./r2PriceHistory";
import { uploadPriceTrends } from "./r2PriceTrends";
import { r2PokemonMarketMoversKey } from "./r2BucketLayout";
import {
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPrices,
  parseScrydexExpansionListPaths,
  resolveScrydexListUsd,
  resolveScrydexCardPath,
} from "./scrydexExpansionListParsing";
import {
  fetchScrydexCardPageHtml,
  parseScrydexCardPageRawNearMintUsd,
  parseScrydexCardPagePsa10Usd,
  parseScrydexCardPageAce10Usd,
  mergeScrydexExpansionAndDetailUsd,
  canonicalScrydexVariantLabel,
  SCRYDEX_FLAT_PSA10_KEY_SUFFIX,
  SCRYDEX_FLAT_ACE10_KEY_SUFFIX,
} from "./scrydexMepCardPagePricing";
import { resolveExpansionConfigsForSet } from "./scrydexExpansionConfigsForSet";
import { buildScrydexPrefixCandidates, setRowMatchesAllowedSetCodes } from "./scrydexPrefixCandidatesForSet";
import { applyPricingVariantsToCardsInPlace } from "./applyPricingVariantsToCardJson";
import { canonicalVariantSlugFromCompactLabel } from "./pricingVariantCompactAliases";
import { scrapeTcgPlayerPrice, closeBrowser } from "./tcgplayerScraper";

interface ScrapePricingOptions {
  dryRun?: boolean;
  onlySetCodes?: string[];
  onlySeriesNames?: string[];
}

export interface MarketMoverEntry {
  cardID: string;
  cardName: string;
  imageURL: string | null;
  percentChange: number;
  setCode: string;
}

export interface PokemonMarketMovers {
  topGainer: MarketMoverEntry | null;
  topDecliner: MarketMoverEntry | null;
  updatedAt: string;
}

function getSinglesCatalogSetKey(set: SetJsonEntry): string | null {
  const k = typeof set.setKey === "string" ? set.setKey.trim() : "";
  return k || null;
}

// ─── Catalog from R2 (same keys as /admin APIs) ───────────────────────────────

async function getJsonFromR2<T>(s3: S3Client, key: string): Promise<T | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
      }),
    );
    const raw = await result.Body?.transformToString();
    if (!raw?.trim()) return null;
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const name = (error as { name?: string }).name;
    if (status === 404 || name === "NoSuchKey") return null;
    throw error;
  }
}

async function putJsonToR2(s3: S3Client, key: string, value: unknown): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: JSON.stringify(value, null, 2) + "\n",
      ContentType: "application/json; charset=utf-8",
    }),
  );
}

async function loadSetsFromR2(s3: S3Client): Promise<SetJsonEntry[]> {
  const sets = await getJsonFromR2<SetJsonEntry[]>(s3, "data/sets.json");
  if (!sets?.length) throw new Error("data/sets.json not found or empty in R2");
  return sets;
}

async function loadSeriesFromR2(s3: S3Client): Promise<SeriesJsonEntry[]> {
  return (await getJsonFromR2<SeriesJsonEntry[]>(s3, "data/series.json")) ?? [];
}

async function loadCardsForSetFromR2(s3: S3Client, setCode: string): Promise<CardJsonEntry[]> {
  return (await getJsonFromR2<CardJsonEntry[]>(s3, `data/cards/${setCode}.json`)) ?? [];
}

// ─── Pricing helpers ──────────────────────────────────────────────────────────

type ByVariant = Record<string, { raw?: number; psa10?: number; ace10?: number }>;

/** When Scrydex has no NM/graded data, still emit pricing + history/trends so every catalog card has a row. */
function scrydexZeroPricingPlaceholder(): ScrydexCardPricing {
  return {
    default: { raw: 0, psa10: 0, ace10: 0 },
  };
}

function slugFromLabel(label: string): string {
  const compact = label.toLowerCase().replace(/[\s-_]+/g, "");
  const canon = canonicalVariantSlugFromCompactLabel(compact);
  if (canon !== null) return canon;
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

// ─── R2 helpers ───────────────────────────────────────────────────────────────

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

function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

// ─── Per-set scrape ───────────────────────────────────────────────────────────

async function scrapeSet(
  set: SetJsonEntry,
  cards: CardJsonEntry[],
  s3: S3Client,
  dryRun: boolean,
): Promise<{ changed: boolean; topGainer: MarketMoverEntry | null; topDecliner: MarketMoverEntry | null }> {
  const setCode = getSinglesCatalogSetKey(set);
  if (!setCode) return { changed: false, topGainer: null, topDecliner: null };

  const configs = resolveExpansionConfigsForSet(set);
  if (!configs.length) {
    console.log(`  [${setCode}] skip — no Scrydex URL mapped`);
    return { changed: false, topGainer: null, topDecliner: null };
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
      // Lowercase is only for pathMap / priceMap keys (normalized in listing parsers).
      // `resolveScrydexCardPath` returns the href path from Scrydex HTML — e.g. …/swsh12tg-TG02 — unchanged.
      const extLower = (card.externalId ?? "").trim().toLowerCase();
      if (!extLower) continue;
      const p = resolveScrydexCardPath(pathMap, extLower, cfg.listPrefix, tcgPrefixes);
      if (p) pathsNeeded.add(p);
    }
  }

  if (!perConfig.size) {
    console.warn(`  [${setCode}] WARNING: Scrydex expansion list scrape failed completely for all configs. Will attempt fallback to last available prices from R2.`);
  }

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
    const storageKey = (card.externalId ?? "").trim();
    // Scrydex listing maps use lowercase-normalized keys; card page fetch still uses canonical path casing.
    const extLower = storageKey.toLowerCase();
    if (!extLower) continue;

    // Check if this is a temporary custom card
    if ((card as any).isCustomSource) {
      let tcgPrice = null;
      if ((card as any).tcgplayerScrapeUrl) {
        console.log(`  [${setCode}] Scraping custom TCGPlayer URL for ${storageKey}...`);
        tcgPrice = await scrapeTcgPlayerPrice((card as any).tcgplayerScrapeUrl);
      }
      
      const scrydex = scrydexZeroPricingPlaceholder();
      if (tcgPrice !== null) {
        scrydex.default.raw = tcgPrice;
      }
      
      pricingMap[storageKey] = { scrydex, tcgplayer: null, cardmarket: null };
      continue;
    }

    let flatUsd: Record<string, number> = {};
    for (const cfg of configs) {
      const entry = perConfig.get(cfg.listPrefix);
      if (!entry) continue;
      const listUsd = resolveScrydexListUsd(entry.priceMap, extLower, cfg.listPrefix, tcgPrefixes);
      const cardPath = resolveScrydexCardPath(entry.pathMap, extLower, cfg.listPrefix, tcgPrefixes);
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
    const scrydex: ScrydexCardPricing = hasPrice ? byVariant : scrydexZeroPricingPlaceholder();

    pricingMap[storageKey] = { scrydex, tcgplayer: null, cardmarket: null };
  }

  const count = Object.keys(pricingMap).length;

  if (dryRun) {
    console.log(`  [${setCode}] ${count} cards scraped (dry-run — skipping R2 uploads)`);
    return { changed: false, topGainer: null, topDecliner: null };
  }

  const { historyMap, dailyFile } = await updatePriceHistory(s3, setCode, pricingMap);
  const trendMap = await uploadPriceTrends(s3, setCode, historyMap);

  // Build cardId → CardJsonEntry lookup for name/image resolution.
  const cardByExternalId = new Map<string, CardJsonEntry>();
  const cardByMasterId = new Map<string, CardJsonEntry>();
  for (const card of cards) {
    if (card.externalId) cardByExternalId.set(card.externalId.trim().toLowerCase(), card);
    cardByMasterId.set(card.masterCardId.toLowerCase(), card);
  }

  // Pick the biggest weekly gainer and decliner for this set.
  let topGainer: MarketMoverEntry | null = null;
  let topDecliner: MarketMoverEntry | null = null;
  for (const [externalId, summary] of Object.entries(trendMap)) {
    const change = summary.weekly?.changePct;
    if (typeof change !== "number" || !Number.isFinite(change)) continue;
    const card = cardByExternalId.get(externalId.toLowerCase())
      ?? cardByMasterId.get(externalId.toLowerCase());
    if (!card) continue;
    const entry: MarketMoverEntry = {
      cardID: card.masterCardId,
      cardName: card.cardName,
      imageURL: card.imageLowSrc ?? null,
      percentChange: change,
      setCode,
    };
    if (topGainer === null || change > topGainer.percentChange) topGainer = entry;
    if (topDecliner === null || change < topDecliner.percentChange) topDecliner = entry;
  }

  // Update pricingVariants on card JSON using the flat daily bucket shape.
  const dailyBucketForSet: Record<string, Record<string, Record<string, number>>> = {};
  for (const card of cards) {
    const externalId = (card.externalId ?? "").trim();
    if (externalId && dailyFile[externalId]) {
      dailyBucketForSet[externalId] = dailyFile[externalId];
    }
  }

  let setChanged = false;
  const cardKey = `data/cards/${setCode}.json`;
  try {
    const cardRows = await getJsonFromR2<CardJsonEntry[]>(s3, cardKey);
    if (cardRows?.length) {
      const vChanged = applyPricingVariantsToCardsInPlace(cardRows, dailyBucketForSet);
      if (vChanged) {
        await putJsonToR2(s3, cardKey, cardRows);
        console.log(`  [${setCode}] updated pricingVariants in R2 ${cardKey}`);

        let newMasterTotal = 0;
        for (const card of cardRows) {
          const variantsCount = card.pricingVariants && card.pricingVariants.length > 0
            ? card.pricingVariants.length
            : 1;
          newMasterTotal += variantsCount;
        }
        if (set.masterSetTotal !== newMasterTotal) {
          set.masterSetTotal = newMasterTotal;
          setChanged = true;
        }
      }
    }
  } catch (e) {
    console.warn(`  [${setCode}] could not merge pricingVariants into card JSON: ${e instanceof Error ? e.message : e}`);
  }

  console.log(`  [${setCode}] ${count} cards → history + trends written to R2`);
  return { changed: setChanged, topGainer, topDecliner };
}

// ─── Exported job function ────────────────────────────────────────────────────

export async function runScrapePricing(opts: ScrapePricingOptions = {}): Promise<void> {
  const { dryRun = false, onlySetCodes, onlySeriesNames } = opts;
  const s3 = buildS3Client();

  const allSets = await loadSetsFromR2(s3);
  let sets = allSets;

  if (onlySetCodes?.length) {
    sets = allSets.filter((s) => setRowMatchesAllowedSetCodes(s, onlySetCodes));
    if (!sets.length) throw new Error(`No sets found matching: ${onlySetCodes.join(", ")}`);
  } else if (onlySeriesNames?.length) {
    const allSeries = await loadSeriesFromR2(s3);
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

  console.log(`=== Scrydex price scrape (${scopeLabel}) — catalog from R2, outputs to R2 ===`);
  if (dryRun) console.log("(dry-run: no R2 uploads)\n");

  let anySetChanged = false;
  let globalTopGainer: MarketMoverEntry | null = null;
  let globalTopDecliner: MarketMoverEntry | null = null;

  for (const set of sets) {
    const setCode = getSinglesCatalogSetKey(set);
    if (!setCode) continue;
    const cards = await loadCardsForSetFromR2(s3, setCode);
    if (!cards.length) {
      console.log(`  [${setCode}] skip — no cards in R2 data/cards/${setCode}.json`);
      continue;
    }
    const { changed, topGainer, topDecliner } = await scrapeSet(set, cards, s3, dryRun);
    if (changed) anySetChanged = true;
    if (topGainer && (globalTopGainer === null || topGainer.percentChange > globalTopGainer.percentChange)) {
      globalTopGainer = topGainer;
    }
    if (topDecliner && (globalTopDecliner === null || topDecliner.percentChange < globalTopDecliner.percentChange)) {
      globalTopDecliner = topDecliner;
    }
  }

  if (anySetChanged && !dryRun) {
    await putJsonToR2(s3, "data/sets.json", allSets);
    console.log("Updated data/sets.json in R2 with new masterSetTotal values");
  }

  if (!dryRun) {
    const movers: PokemonMarketMovers = {
      topGainer: globalTopGainer,
      topDecliner: globalTopDecliner,
      updatedAt: new Date().toISOString(),
    };
    try {
      await s3.send(new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: r2PokemonMarketMoversKey,
        Body: JSON.stringify(movers, null, 2),
        ContentType: "application/json",
      }));
      console.log(`Market movers written to R2 ${r2PokemonMarketMoversKey}`);
    } catch (e) {
      console.warn(`Failed to write market movers: ${e instanceof Error ? e.message : e}`);
    }
  }

  await closeBrowser();
  console.log("\nDone.");
}
