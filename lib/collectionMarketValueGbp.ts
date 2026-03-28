import type { StorefrontCardEntry } from "@/lib/storefrontCardMaps";
import { getPricingForSet, getPricingForCard } from "@/lib/r2Pricing";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { getTcgplayerVariantBlock } from "@/lib/tcgdexMarketLinks";
import { TCG_PRICE_VARIANTS } from "@/lib/tcgdexTcgplayerVariants";

function readMarketFromVariantBlock(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  const m = o.market ?? o.marketPrice;
  return typeof m === "number" && Number.isFinite(m) ? m : null;
}

function estimateUnitGbpFromPricing(
  tcgplayer: unknown,
  cardmarket: unknown,
  scrydex: unknown,
  multipliers: { usdToGbp: number; eurToGbp: number },
  printing?: string,
): number | null {
  const tpObj = tcgplayer && typeof tcgplayer === "object" ? (tcgplayer as Record<string, unknown>) : null;
  if (tpObj) {
    if (printing?.trim()) {
      const specific = readMarketFromVariantBlock(tpObj[printing.trim()]);
      if (specific !== null) return specific * multipliers.usdToGbp;
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
  // Fall back to Scrydex: { [variant]: { raw: number } } — raw is already GBP
  const scObj = scrydex && typeof scrydex === "object" ? (scrydex as Record<string, unknown>) : null;
  if (scObj) {
    if (printing?.trim()) {
      const block = scObj[printing.trim()];
      if (block && typeof block === "object") {
        const r = (block as Record<string, unknown>).raw;
        if (typeof r === "number" && Number.isFinite(r)) return r;
      }
    }
    for (const block of Object.values(scObj)) {
      if (!block || typeof block !== "object") continue;
      const r = (block as Record<string, unknown>).raw;
      if (typeof r === "number" && Number.isFinite(r)) return r;
    }
  }
  return null;
}

/**
 * Returns a map of masterCardId → unit price in GBP for display under each card.
 */
export async function estimateCardUnitPricesGbp(
  entries: StorefrontCardEntry[],
): Promise<Record<string, number>> {
  const multipliers = await fetchGbpConversionMultipliers();
  const out: Record<string, number> = {};

  // Group by setCode to minimise R2 fetches
  const bySet = new Map<string, StorefrontCardEntry[]>();
  const seen = new Set<string>();
  for (const e of entries) {
    const mid = e.masterCardId?.trim();
    const setCode = e.set?.trim();
    if (!mid || !setCode || seen.has(mid)) continue;
    seen.add(mid);
    if (!bySet.has(setCode)) bySet.set(setCode, []);
    bySet.get(setCode)!.push(e);
  }

  await Promise.all(
    [...bySet.entries()].map(async ([setCode, cardEntries]) => {
      const pricingMap = await getPricingForSet(setCode);
      if (!pricingMap) return;
      for (const e of cardEntries) {
        const mid = e.masterCardId?.trim();
        const ext = e.externalId?.trim();
        if (!mid || !ext) continue;
        const fallback = e.legacyExternalId?.trim() ? [e.legacyExternalId.trim()] : undefined;
        const entry = getPricingForCard(pricingMap, ext, fallback);
        if (!entry) continue;
        const price = estimateUnitGbpFromPricing(entry.tcgplayer, entry.cardmarket, entry.scrydex, multipliers, e.printing);
        if (price !== null) out[mid] = price;
      }
    }),
  );

  return out;
}

export type CollectionMarketValueResult = {
  totalGbp: number;
  pricedCardCount: number;
  attemptedCardCount: number;
  hasIncompleteData: boolean;
};

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
    { quantity: number; externalId: string; printing?: string; legacyExternalId?: string; setCode: string }
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
    const key: RowKey = `${ext}::${printing ?? ""}`;
    const prev = rowMap.get(key);
    if (prev) {
      rowMap.set(key, { ...prev, quantity: prev.quantity + q });
    } else {
      rowMap.set(key, { quantity: q, externalId: ext, printing, legacyExternalId, setCode });
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
          unitByKey.set(key, null);
          continue;
        }
        const fallback = row.legacyExternalId ? [row.legacyExternalId] : undefined;
        const entry = getPricingForCard(pricingMap, row.externalId, fallback);
        if (!entry) {
          unitByKey.set(key, null);
          continue;
        }
        unitByKey.set(key, estimateUnitGbpFromPricing(entry.tcgplayer, entry.cardmarket, entry.scrydex, multipliers, row.printing));
      }
    }),
  );

  let totalGbp = 0;
  let pricedCardCount = 0;
  let missingPriceForId = 0;

  for (const key of rowKeys) {
    const qty = rowMap.get(key)?.quantity ?? 0;
    const unit = unitByKey.get(key) ?? null;
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
