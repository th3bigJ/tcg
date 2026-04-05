/**
 * Backfill per-card price history from Scrydex chart data.
 * Seeds R2 pricing/price-history/{setCode}.json with real historical daily dates,
 * then derives weekly/monthly windows from those daily points.
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillPriceHistoryFromScrydex.ts --set=me03
 *   node --import tsx/esm scripts/backfillPriceHistoryFromScrydex.ts --set=me03 --dry-run
 *   node --import tsx/esm scripts/backfillPriceHistoryFromScrydex.ts --series="Sword & Shield,Base"
 *   (comma-separated set codes for --set=; comma-separated series names for --series=; both narrow together)
 */

import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2SinglesPriceHistoryPrefix } from "../lib/r2BucketLayout";
import type {
  CardJsonEntry,
  CardPriceHistory,
  PriceHistoryPoint,
  SetJsonEntry,
  SetPriceHistoryMap,
} from "../lib/staticDataTypes";
import {
  currentMonthKey,
  currentWeekKey,
  mergeDailySeriesIntoWindow,
  todayKey,
} from "../lib/r2PriceHistory";
import { uploadPriceTrends } from "../lib/r2PriceTrends";
import {
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPaths,
  resolveScrydexCardPath,
} from "../lib/scrydexExpansionListParsing";
import {
  canonicalScrydexVariantLabel,
  fetchScrydexCardPageHtml,
  parseScrydexCardPageAce10HistoryUsd,
  parseScrydexCardPagePsa10HistoryUsd,
  parseScrydexCardPageRawNearMintHistoryUsd,
  SCRYDEX_FLAT_ACE10_KEY_SUFFIX,
  SCRYDEX_FLAT_PSA10_KEY_SUFFIX,
  type ScrydexHistoryPoint,
} from "../lib/scrydexMepCardPagePricing";
import { lookupScrydexBulkExpansionConfig } from "../lib/scrydexBulkExpansionUrls";
import { scrydexMegaExpansionConfig, type ScrydexExpansionListConfig } from "../lib/scrydexMegaEvolutionUrls";
import { scrydexScarletVioletExpansionConfig } from "../lib/scrydexScarletVioletUrls";

const dryRun = process.argv.includes("--dry-run");
const setArg = process.argv.find((arg) => arg.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((value) => value.trim()).filter(Boolean)
  : undefined;
const seriesArg = process.argv.find((arg) => arg.startsWith("--series="));
const onlySeriesNames = seriesArg
  ? seriesArg.slice("--series=".length).split(",").map((value) => value.trim()).filter(Boolean)
  : undefined;

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");

function loadSets(): SetJsonEntry[] {
  return readJson<SetJsonEntry[]>(path.join(DATA_DIR, "sets.json"));
}

function loadCardsForSet(setCode: string): CardJsonEntry[] {
  const file = path.join(CARDS_DIR, `${setCode}.json`);
  if (!fs.existsSync(file)) return [];
  return readJson<CardJsonEntry[]>(file);
}

function resolveExpansionConfig(set: SetJsonEntry): ScrydexExpansionListConfig | null {
  const code = set.code ?? undefined;
  const tcgdexId = set.tcgdexId ?? undefined;
  const candidates = [code, tcgdexId].filter((value): value is string => Boolean(value?.trim()));
  for (const candidate of candidates) {
    const result = scrydexMegaExpansionConfig(candidate, undefined, undefined);
    if (result) return result;
  }
  for (const candidate of candidates) {
    const result = scrydexScarletVioletExpansionConfig(candidate, undefined, undefined);
    if (result) return result;
  }
  for (const candidate of candidates) {
    const result = lookupScrydexBulkExpansionConfig(candidate, undefined, undefined);
    if (result) return result;
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

  const config = resolveExpansionConfig(set);
  return config ? [config] : [];
}

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
      .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
      .join("")
  );
}

type VariantGradeHistoryMap = Record<string, Record<string, PriceHistoryPoint[]>>;

function collateFlatHistoryToByVariant(
  flatHistory: Record<string, ScrydexHistoryPoint[]>,
  usdToGbp: number,
): VariantGradeHistoryMap {
  const out: VariantGradeHistoryMap = {};

  for (const [key, points] of Object.entries(flatHistory)) {
    const normalizedPoints: PriceHistoryPoint[] = points
      .map(([dateKey, usd]) => [dateKey, usd * usdToGbp] as PriceHistoryPoint)
      .filter(([, gbp]) => Number.isFinite(gbp));
    if (normalizedPoints.length === 0) continue;

    if (key.endsWith(SCRYDEX_FLAT_PSA10_KEY_SUFFIX)) {
      const base = key.slice(0, -SCRYDEX_FLAT_PSA10_KEY_SUFFIX.length);
      const slug = slugFromLabel(canonicalScrydexVariantLabel(base));
      out[slug] ??= {};
      out[slug].psa10 = normalizedPoints;
      continue;
    }

    if (key.endsWith(SCRYDEX_FLAT_ACE10_KEY_SUFFIX)) {
      const base = key.slice(0, -SCRYDEX_FLAT_ACE10_KEY_SUFFIX.length);
      const slug = slugFromLabel(canonicalScrydexVariantLabel(base));
      out[slug] ??= {};
      out[slug].ace10 = normalizedPoints;
      continue;
    }

    const slug = slugFromLabel(canonicalScrydexVariantLabel(key));
    out[slug] ??= {};
    out[slug].raw = normalizedPoints;
  }

  return out;
}

function buildHistoryForCard(flatHistory: Record<string, ScrydexHistoryPoint[]>, usdToGbp: number): CardPriceHistory | null {
  const byVariant = collateFlatHistoryToByVariant(flatHistory, usdToGbp);
  const out: CardPriceHistory = {};

  for (const [variantSlug, grades] of Object.entries(byVariant)) {
    for (const [gradeKey, points] of Object.entries(grades)) {
      const window = mergeDailySeriesIntoWindow(undefined, points);
      if (window.daily.length === 0 && window.weekly.length === 0 && window.monthly.length === 0) {
        continue;
      }
      out[variantSlug] ??= {};
      out[variantSlug][gradeKey] = window;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

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

async function uploadHistoryToR2(s3: S3Client, setCode: string, historyMap: SetPriceHistoryMap): Promise<void> {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${r2SinglesPriceHistoryPrefix}/${setCode}.json`,
      Body: JSON.stringify(historyMap),
      ContentType: "application/json",
    }),
  );
}

async function backfillSet(
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

  const tcgPrefixes = [set.code, set.tcgdexId].filter((value): value is string => Boolean(value?.trim()));
  const pathMaps = new Map<string, Map<string, string>>();

  for (const config of configs) {
    console.log(`  [${setCode}] fetching expansion listing (${config.listPrefix})…`);
    const expansionHtml = await fetchScrydexExpansionMultiPageHtml(config.expansionUrl);
    pathMaps.set(config.listPrefix, parseScrydexExpansionListPaths(expansionHtml, config.listPrefix));
  }

  const historyMap: SetPriceHistoryMap = {};
  let processed = 0;

  for (const card of cards) {
    const ext = (card.externalId ?? card.tcgdex_id ?? "").trim().toLowerCase();
    if (!ext) continue;

    let flatHistory: Record<string, ScrydexHistoryPoint[]> = {};

    for (const config of configs) {
      const pathMap = pathMaps.get(config.listPrefix);
      if (!pathMap) continue;
      const cardPath = resolveScrydexCardPath(pathMap, ext, config.listPrefix, tcgPrefixes);
      if (!cardPath) continue;

      let html = "";
      try {
        html = await fetchScrydexCardPageHtml(cardPath);
      } catch {
        html = "";
      }

      let rawHistory = html ? parseScrydexCardPageRawNearMintHistoryUsd(html) : {};
      let psa10History = html ? parseScrydexCardPagePsa10HistoryUsd(html) : {};
      let ace10History = html ? parseScrydexCardPageAce10HistoryUsd(html) : {};

      if (
        cardPath &&
        Object.keys(rawHistory).length === 0 &&
        Object.keys(psa10History).length === 0 &&
        Object.keys(ace10History).length === 0
      ) {
        try {
          html = await fetchScrydexCardPageHtml(cardPath, "normal");
        } catch {
          html = "";
        }
        rawHistory = html ? parseScrydexCardPageRawNearMintHistoryUsd(html) : {};
        psa10History = html ? parseScrydexCardPagePsa10HistoryUsd(html) : {};
        ace10History = html ? parseScrydexCardPageAce10HistoryUsd(html) : {};
      }

      flatHistory = { ...flatHistory, ...rawHistory, ...psa10History, ...ace10History };
    }

    const cardHistory = buildHistoryForCard(flatHistory, usdToGbp);
    if (!cardHistory) continue;

    historyMap[card.externalId ?? ext] = cardHistory;
    processed++;
    if (processed % 25 === 0) {
      console.log(`  [${setCode}] built history for ${processed} cards…`);
    }
  }

  if (dryRun) {
    console.log(`  [${setCode}] ${Object.keys(historyMap).length} history cards (dry-run — skipping R2 upload)`);
    return;
  }

  await uploadHistoryToR2(s3, setCode, historyMap);
  await uploadPriceTrends(s3, setCode, historyMap);
  console.log(
    `  [${setCode}] ${Object.keys(historyMap).length} history cards → R2 ${r2SinglesPriceHistoryPrefix}/${setCode}.json`,
  );
}

async function main(): Promise<void> {
  const envFile = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (match) process.env[match[1].trim()] ??= match[2].trim();
    }
  }

  const allSets = loadSets();
  const allowedCodes =
    onlySetCodes && onlySetCodes.length > 0
      ? new Set(onlySetCodes.map((value) => value.toLowerCase()))
      : null;
  const allowedSeries =
    onlySeriesNames && onlySeriesNames.length > 0
      ? new Set(onlySeriesNames.map((value) => value.toLowerCase()))
      : null;

  const sets = allSets.filter((set) => {
    if (allowedCodes) {
      const codeOk =
        (set.code && allowedCodes.has(set.code.toLowerCase())) ||
        (set.tcgdexId && allowedCodes.has(set.tcgdexId.toLowerCase()));
      if (!codeOk) return false;
    }
    if (allowedSeries) {
      const name = set.seriesName?.trim().toLowerCase();
      if (!name || !allowedSeries.has(name)) return false;
    }
    return true;
  });

  if (!sets.length) {
    const parts: string[] = [];
    if (onlySetCodes?.length) parts.push(`set codes: ${onlySetCodes.join(", ")}`);
    if (onlySeriesNames?.length) parts.push(`series: ${onlySeriesNames.join(", ")}`);
    throw new Error(`No sets found matching ${parts.join("; ") || "filters"}`);
  }

  const filterLabel =
    [onlySetCodes?.join(", "), onlySeriesNames?.join(", ")].filter(Boolean).join(" + ") || "all sets";
  console.log(`=== Scrydex price-history backfill (${filterLabel}) ===`);
  if (dryRun) console.log("(dry-run: no R2 uploads)\n");
  console.log(`Windows: daily=${todayKey()} weekly=${currentWeekKey()} monthly=${currentMonthKey()}`);

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
    await backfillSet(set, cards, usdToGbp, s3);
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
