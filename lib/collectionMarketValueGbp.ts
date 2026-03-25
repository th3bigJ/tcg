import type { Payload } from "payload";

import { resolveCardPricingGbp } from "@/lib/resolveCardPricingGbp";

import type { StorefrontCardEntry } from "@/lib/storefrontCardMaps";
import { getTcgplayerVariantBlock } from "@/lib/tcgdexMarketLinks";
import { TCG_PRICE_VARIANTS } from "@/lib/tcgdexTcgplayerVariants";

function readMarketFromVariantBlock(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  const m = o.market ?? o.marketPrice;
  return typeof m === "number" && Number.isFinite(m) ? m : null;
}

/**
 * Single guide price in GBP from catalog snapshots.
 * If `printing` is set and matches a variant key in tcgplayer, uses that variant's raw price.
 * Otherwise falls through TCGPlayer variants in order, then Cardmarket.
 */
function estimateUnitGbpFromConvertedPricing(
  tcgplayer: unknown,
  cardmarket: unknown,
  printing?: string,
): number | null {
  const tpObj = tcgplayer && typeof tcgplayer === "object" ? (tcgplayer as Record<string, unknown>) : null;
  if (tpObj) {
    // Try the specific printing first
    if (printing?.trim()) {
      const specific = readMarketFromVariantBlock(tpObj[printing.trim()]);
      if (specific !== null) return specific;
    }
    // Fall back to first available variant
    for (const k of TCG_PRICE_VARIANTS) {
      const v = readMarketFromVariantBlock(getTcgplayerVariantBlock(tpObj, k));
      if (v !== null) return v;
    }
    // Also check any non-standard variant keys (e.g. staffStamp)
    for (const [, block] of Object.entries(tpObj)) {
      const v = readMarketFromVariantBlock(block);
      if (v !== null) return v;
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
    if (trend !== null) return trend;
    const avg30 =
      typeof cmObj.avg30 === "number" && Number.isFinite(cmObj.avg30) ? cmObj.avg30 : null;
    if (avg30 !== null) return avg30;
    const avgSell =
      typeof cmObj.averageSellPrice === "number" && Number.isFinite(cmObj.averageSellPrice)
        ? cmObj.averageSellPrice
        : null;
    if (avgSell !== null) return avgSell;
  }
  return null;
}

async function unitPriceGbpForExternalId(
  payload: Payload,
  externalId: string,
  legacyExternalId?: string,
  masterCardId?: string,
  printing?: string,
): Promise<number | null> {
  const resolved = await resolveCardPricingGbp(payload, {
    ...(masterCardId?.trim() ? { masterCardId: masterCardId.trim() } : {}),
    tcgdexId: externalId,
    externalId,
    legacyExternalId,
  });
  if (!resolved) return null;
  return estimateUnitGbpFromConvertedPricing(resolved.tcgplayer, resolved.cardmarket, printing);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/**
 * Returns a map of masterCardId → unit price in GBP for display under each card.
 */
export async function estimateCardUnitPricesGbp(
  payload: Payload,
  entries: StorefrontCardEntry[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const seen = new Set<string>();
  const tasks: { masterCardId: string; externalId: string; legacyExternalId?: string; printing?: string }[] = [];

  for (const e of entries) {
    const mid = e.masterCardId?.trim();
    const ext = e.externalId?.trim();
    if (!mid || !ext || seen.has(mid)) continue;
    seen.add(mid);
    tasks.push({
      masterCardId: mid,
      externalId: ext,
      legacyExternalId: e.legacyExternalId?.trim() || undefined,
      printing: e.printing?.trim() || undefined,
    });
  }

  await mapWithConcurrency(tasks, 6, async (t) => {
    const price = await unitPriceGbpForExternalId(payload, t.externalId, t.legacyExternalId, t.masterCardId, t.printing);
    if (price !== null) out[t.masterCardId] = price;
  });

  return out;
}

export type CollectionMarketValueResult = {
  /** Sum of (quantity × unit estimate) for rows where a unit price was found. */
  totalGbp: number;
  /** Distinct catalog cards (external ids) that contributed to the sum. */
  pricedCardCount: number;
  /** Distinct external ids we attempted (non-empty) — priced + unpriced. */
  attemptedCardCount: number;
  /** True if at least one collection row had no usable external id or no market data. */
  hasIncompleteData: boolean;
};

/**
 * Estimates total market value for a list of storefront card rows (e.g. collection or wishlist)
 * from **catalog-card-pricing** only. **TCGPlayer** variant market first, then Cardmarket.
 * Amounts in GBP. Quantities default to 1 when missing.
 */
export async function estimateCollectionMarketValueGbp(
  payload: Payload,
  entries: StorefrontCardEntry[],
): Promise<CollectionMarketValueResult> {
  // Key by externalId + printing so each variant is priced separately
  type RowKey = string; // `${externalId}::${printing}`
  const rowMap = new Map<
    RowKey,
    { quantity: number; externalId: string; printing?: string; legacyExternalId?: string; masterCardId?: string }
  >();
  let rowsWithoutExternalId = 0;

  for (const e of entries) {
    const ext = e.externalId?.trim();
    const q =
      typeof e.quantity === "number" && Number.isFinite(e.quantity) && e.quantity >= 1
        ? Math.floor(e.quantity)
        : 1;
    if (!ext) {
      rowsWithoutExternalId += 1;
      continue;
    }
    const printing = e.printing?.trim() || e.targetPrinting?.trim() || undefined;
    const legacy = e.legacyExternalId?.trim() || undefined;
    const mid = e.masterCardId?.trim() || undefined;
    const key: RowKey = `${ext}::${printing ?? ""}`;
    const prev = rowMap.get(key);
    if (prev) {
      rowMap.set(key, { ...prev, quantity: prev.quantity + q });
    } else {
      rowMap.set(key, { quantity: q, externalId: ext, printing, legacyExternalId: legacy, masterCardId: mid });
    }
  }

  const rowKeys = [...rowMap.keys()];
  if (rowKeys.length === 0) {
    return {
      totalGbp: 0,
      pricedCardCount: 0,
      attemptedCardCount: 0,
      hasIncompleteData: entries.length > 0,
    };
  }

  const unitPrices = await mapWithConcurrency(rowKeys, 6, async (key) => {
    const row = rowMap.get(key)!;
    return {
      key,
      unit: await unitPriceGbpForExternalId(
        payload,
        row.externalId,
        row.legacyExternalId,
        row.masterCardId,
        row.printing,
      ),
    };
  });

  let totalGbp = 0;
  let pricedCardCount = 0;
  let missingPriceForId = 0;

  for (const { key, unit } of unitPrices) {
    const qty = rowMap.get(key)?.quantity ?? 0;
    if (unit === null) {
      missingPriceForId += 1;
      continue;
    }
    totalGbp += unit * qty;
    pricedCardCount += 1;
  }

  const hasIncompleteData =
    rowsWithoutExternalId > 0 || missingPriceForId > 0 || pricedCardCount < rowKeys.length;

  return {
    totalGbp,
    pricedCardCount,
    attemptedCardCount: rowKeys.length,
    hasIncompleteData,
  };
}
