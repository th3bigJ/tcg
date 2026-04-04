import { catalogVariantKeyForPricingLookup } from "@/lib/cardVariantLabels";
import {
  type StorefrontCardEntry,
  collectionGroupKeyFromEntry,
  isGradedCollectionEntry,
} from "@/lib/storefrontCardMaps";
import { getPricingForSet, getPricingForCard } from "@/lib/r2Pricing";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { getTcgplayerVariantBlock } from "@/lib/tcgdexMarketLinks";
import { TCGDEX_TCGPLAYER_MARKET_KEYS_BY_VARIANT_KEY } from "@/lib/pricingVariantRegistry";
import { TCG_PRICE_VARIANTS } from "@/lib/tcgdexTcgplayerVariants";

function readMarketFromVariantBlock(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  const m = o.market ?? o.marketPrice;
  return typeof m === "number" && Number.isFinite(m) ? m : null;
}

/** Returns the scrydex graded price key for a given grading company + grade (e.g. "ace"+"10" → "ace10"). */
function scrydexGradedKey(gradingCompany: string, gradeValue: string): string | null {
  const co = gradingCompany.trim().toLowerCase();
  const gv = gradeValue.trim().replace(/\s+/g, "");
  if (!co || !gv) return null;
  return `${co}${gv}`; // e.g. "psa10", "ace10", "bgs9.5"
}

function estimateUnitGbpFromPricing(
  tcgplayer: unknown,
  cardmarket: unknown,
  scrydex: unknown,
  multipliers: { usdToGbp: number; eurToGbp: number },
  printing?: string,
  gradingCompany?: string,
  gradeValue?: string,
): number | null {
  const tpObj = tcgplayer && typeof tcgplayer === "object" ? (tcgplayer as Record<string, unknown>) : null;
  const variantKey = catalogVariantKeyForPricingLookup(printing ?? undefined);
  const tcgplayerKeysForVariant =
    variantKey !== null && variantKey !== undefined
      ? (TCGDEX_TCGPLAYER_MARKET_KEYS_BY_VARIANT_KEY[variantKey] ?? [variantKey])
      : [];
  if (tpObj) {
    if (tcgplayerKeysForVariant.length > 0) {
      for (const k of tcgplayerKeysForVariant) {
        const specific = readMarketFromVariantBlock(tpObj[k]);
        if (specific !== null) return specific * multipliers.usdToGbp;
      }
    }
    for (const k of TCG_PRICE_VARIANTS) {
      const v = readMarketFromVariantBlock(getTcgplayerVariantBlock(tpObj, k));
      if (v !== null) return v * multipliers.usdToGbp;
    }
    for (const [, block] of Object.entries(tpObj)) {
      const v = readMarketFromVariantBlock(block);
      if (v !== null) return v * multipliers.usdToGbp;
    }
  }
  const cmObj = cardmarket && typeof cardmarket === "object" ? (cardmarket as Record<string, unknown>) : null;
  if (cmObj) {
    const trend =
      typeof cmObj.trendPrice === "number" && Number.isFinite(cmObj.trendPrice)
        ? cmObj.trendPrice
        : typeof cmObj.trend === "number" && Number.isFinite(cmObj.trend)
          ? cmObj.trend
          : null;
    if (trend !== null) return trend * multipliers.eurToGbp;
    const avg30 = typeof cmObj.avg30 === "number" && Number.isFinite(cmObj.avg30) ? cmObj.avg30 : null;
    if (avg30 !== null) return avg30 * multipliers.eurToGbp;
    const avgSell =
      typeof cmObj.averageSellPrice === "number" && Number.isFinite(cmObj.averageSellPrice)
        ? cmObj.averageSellPrice
        : null;
    if (avgSell !== null) return avgSell * multipliers.eurToGbp;
  }
  // Fall back to Scrydex: { [variant]: { raw: number, psa10?: number, ace10?: number } } — already GBP
  const scObj = scrydex && typeof scrydex === "object" ? (scrydex as Record<string, unknown>) : null;
  if (scObj) {
    const gradedKey = gradingCompany && gradeValue ? scrydexGradedKey(gradingCompany, gradeValue) : null;
    const readGradedOrRaw = (block: unknown): number | null => {
      if (!block || typeof block !== "object") return null;
      const b = block as Record<string, unknown>;
      if (gradedKey) {
        const g = b[gradedKey];
        if (typeof g === "number" && Number.isFinite(g)) return g;
      }
      const r = b.raw;
      return typeof r === "number" && Number.isFinite(r) ? r : null;
    };
    if (tcgplayerKeysForVariant.length > 0) {
      for (const k of tcgplayerKeysForVariant) {
        const v = readGradedOrRaw(scObj[k]);
        if (v !== null) return v;
      }
    }
    for (const block of Object.values(scObj)) {
      const v = readGradedOrRaw(block);
      if (v !== null) return v;
    }
  }
  return null;
}

/**
 * Returns a map of {@link collectionGroupKeyFromEntry} → unit price in GBP for display under each card,
 * plus a set of those keys whose price came from a manual unlisted entry.
 */
export async function estimateCardUnitPricesGbp(
  entries: StorefrontCardEntry[],
): Promise<{ prices: Record<string, number>; manualPriceIds: Set<string> }> {
  const multipliers = await fetchGbpConversionMultipliers();
  const out: Record<string, number> = {};
  const manualPriceIds = new Set<string>();

  // Group by setCode to minimise R2 fetches (one row per distinct variant + condition + grade)
  const bySet = new Map<string, StorefrontCardEntry[]>();
  const seen = new Set<string>();
  for (const e of entries) {
    const mid = e.masterCardId?.trim();
    const setCode = e.set?.trim();
    if (!mid || !setCode) continue;
    const gk = collectionGroupKeyFromEntry(e);
    if (seen.has(gk)) continue;
    seen.add(gk);
    if (!bySet.has(setCode)) bySet.set(setCode, []);
    bySet.get(setCode)!.push(e);
  }

  await Promise.all(
    [...bySet.entries()].map(async ([setCode, cardEntries]) => {
      const pricingMap = await getPricingForSet(setCode);
      for (const e of cardEntries) {
        const mid = e.masterCardId?.trim();
        const ext = e.externalId?.trim();
        const gk = collectionGroupKeyFromEntry(e);
        if (!mid || !ext) continue;
        // Unlisted manual price takes priority over scraped pricing
        if (e.unlistedPrice !== undefined) {
          out[gk] = e.unlistedPrice;
          manualPriceIds.add(gk);
          continue;
        }
        if (pricingMap) {
          const fallback = e.legacyExternalId?.trim() ? [e.legacyExternalId.trim()] : undefined;
          const entry = getPricingForCard(pricingMap, ext, fallback);
          if (entry) {
            const price = estimateUnitGbpFromPricing(entry.tcgplayer, entry.cardmarket, entry.scrydex, multipliers, e.printing, e.gradingCompany, e.gradeValue);
            if (price !== null) out[gk] = price;
          }
        }
      }
    }),
  );

  return { prices: out, manualPriceIds };
}

export type CollectionMarketValueResult = {
  totalGbp: number;
  pricedCardCount: number;
  attemptedCardCount: number;
  hasIncompleteData: boolean;
};

export type CardCollectionMarketBucketsGbp = {
  singleCardsGbp: number;
  gradedCardsGbp: number;
  /** Ungraded cards logged as pulled from packs (`purchase_type === "packed"`). */
  rippedGbp: number;
};

/** Splits raw singles vs slabs vs packed pulls, then estimates each bucket (parallel R2 pricing). */
export async function estimateCardCollectionBucketsGbp(
  entries: StorefrontCardEntry[],
): Promise<CardCollectionMarketBucketsGbp> {
  const graded: StorefrontCardEntry[] = [];
  const ripped: StorefrontCardEntry[] = [];
  const single: StorefrontCardEntry[] = [];
  for (const e of entries) {
    if (isGradedCollectionEntry(e)) {
      graded.push(e);
      continue;
    }
    if (e.purchaseType === "packed") {
      ripped.push(e);
      continue;
    }
    single.push(e);
  }
  const [g, r, s] = await Promise.all([
    graded.length > 0 ? estimateCollectionMarketValueGbp(graded) : Promise.resolve({ totalGbp: 0 }),
    ripped.length > 0 ? estimateCollectionMarketValueGbp(ripped) : Promise.resolve({ totalGbp: 0 }),
    single.length > 0 ? estimateCollectionMarketValueGbp(single) : Promise.resolve({ totalGbp: 0 }),
  ]);
  return {
    gradedCardsGbp: g.totalGbp,
    rippedGbp: r.totalGbp,
    singleCardsGbp: s.totalGbp,
  };
}

/**
 * Estimates total market value for a list of storefront card rows from R2 pricing.
 */
export async function estimateCollectionMarketValueGbp(
  entries: StorefrontCardEntry[],
): Promise<CollectionMarketValueResult> {
  const multipliers = await fetchGbpConversionMultipliers();

  type RowKey = string;
  const rowMap = new Map<
    RowKey,
    { quantity: number; externalId: string; printing?: string; legacyExternalId?: string; setCode: string; manualPrice?: number; gradingCompany?: string; gradeValue?: string }
  >();
  let rowsWithoutExternalId = 0;

  for (const e of entries) {
    const ext = e.externalId?.trim();
    const setCode = e.set?.trim();
    const q =
      typeof e.quantity === "number" && Number.isFinite(e.quantity) && e.quantity >= 1
        ? Math.floor(e.quantity)
        : 1;
    if (!ext || !setCode) {
      rowsWithoutExternalId += 1;
      continue;
    }
    const printing = e.printing?.trim() || e.targetPrinting?.trim() || undefined;
    const legacyExternalId = e.legacyExternalId?.trim() || undefined;
    const manualPrice = e.unlistedPrice;
    const gradingCompany = e.gradingCompany?.trim() || undefined;
    const gradeValue = e.gradeValue?.trim() || undefined;
    const key: RowKey = `${ext}::${printing ?? ""}::${gradingCompany ?? ""}::${gradeValue ?? ""}`;
    const prev = rowMap.get(key);
    if (prev) {
      rowMap.set(key, { ...prev, quantity: prev.quantity + q });
    } else {
      rowMap.set(key, { quantity: q, externalId: ext, printing, legacyExternalId, setCode, manualPrice, gradingCompany, gradeValue });
    }
  }

  const rowKeys = [...rowMap.keys()];
  if (rowKeys.length === 0) {
    return { totalGbp: 0, pricedCardCount: 0, attemptedCardCount: 0, hasIncompleteData: entries.length > 0 };
  }

  // Group by setCode
  const bySet = new Map<string, RowKey[]>();
  for (const key of rowKeys) {
    const setCode = rowMap.get(key)!.setCode;
    if (!bySet.has(setCode)) bySet.set(setCode, []);
    bySet.get(setCode)!.push(key);
  }

  const unitByKey = new Map<RowKey, number | null>();
  await Promise.all(
    [...bySet.entries()].map(async ([setCode, keys]) => {
      const pricingMap = await getPricingForSet(setCode);
      for (const key of keys) {
        const row = rowMap.get(key)!;
        if (!pricingMap) {
          unitByKey.set(key, row.manualPrice ?? null);
          continue;
        }
        // Unlisted manual price takes priority over scraped pricing
        if (row.manualPrice !== undefined) {
          unitByKey.set(key, row.manualPrice);
          continue;
        }
        const fallback = row.legacyExternalId ? [row.legacyExternalId] : undefined;
        const entry = getPricingForCard(pricingMap, row.externalId, fallback);
        if (!entry) {
          unitByKey.set(key, null);
          continue;
        }
        unitByKey.set(key, estimateUnitGbpFromPricing(entry.tcgplayer, entry.cardmarket, entry.scrydex, multipliers, row.printing, row.gradingCompany, row.gradeValue));
      }
    }),
  );

  let totalGbp = 0;
  let pricedCardCount = 0;
  let missingPriceForId = 0;

  for (const key of rowKeys) {
    const row = rowMap.get(key);
    const qty = row?.quantity ?? 0;
    const unit = unitByKey.get(key) ?? row?.manualPrice ?? null;
    if (unit === null) {
      missingPriceForId += 1;
      continue;
    }
    totalGbp += unit * qty;
    pricedCardCount += 1;
  }

  return {
    totalGbp,
    pricedCardCount,
    attemptedCardCount: rowKeys.length,
    hasIncompleteData: rowsWithoutExternalId > 0 || missingPriceForId > 0 || pricedCardCount < rowKeys.length,
  };
}
