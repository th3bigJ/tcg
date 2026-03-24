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
 * Single guide price in GBP (already converted). Collection totals use **TCGPlayer** first
 * (normal → holofoil → reverse holo `market`), then Cardmarket trend / averages if needed.
 */
function estimateUnitGbpFromConvertedPricing(tcgplayer: unknown, cardmarket: unknown): number | null {
  const tpObj = tcgplayer && typeof tcgplayer === "object" ? (tcgplayer as Record<string, unknown>) : null;
  if (tpObj) {
    for (const k of TCG_PRICE_VARIANTS) {
      const v = readMarketFromVariantBlock(getTcgplayerVariantBlock(tpObj, k));
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
): Promise<number | null> {
  const resolved = await resolveCardPricingGbp(payload, {
    tcgdexId: externalId,
    externalId,
    legacyExternalId,
  });
  if (!resolved) return null;
  return estimateUnitGbpFromConvertedPricing(resolved.tcgplayer, resolved.cardmarket);
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
 * Estimates total market value for a list of storefront card rows (e.g. collection or wishlist):
 * **catalog-card-pricing** when present, else live TCGdex. **TCGPlayer** variant market first,
 * then Cardmarket. Amounts in GBP. Quantities default to 1 when missing.
 */
export async function estimateCollectionMarketValueGbp(
  payload: Payload,
  entries: StorefrontCardEntry[],
): Promise<CollectionMarketValueResult> {
  const qtyByExternalId = new Map<string, { quantity: number; legacyExternalId?: string }>();
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
    const legacy = e.legacyExternalId?.trim() || undefined;
    const prev = qtyByExternalId.get(ext);
    if (prev) {
      qtyByExternalId.set(ext, {
        quantity: prev.quantity + q,
        legacyExternalId: prev.legacyExternalId ?? legacy,
      });
    } else {
      qtyByExternalId.set(ext, { quantity: q, legacyExternalId: legacy });
    }
  }

  const ids = [...qtyByExternalId.keys()];
  if (ids.length === 0) {
    return {
      totalGbp: 0,
      pricedCardCount: 0,
      attemptedCardCount: 0,
      hasIncompleteData: entries.length > 0,
    };
  }

  const unitPrices = await mapWithConcurrency(ids, 6, async (ext) => {
    const row = qtyByExternalId.get(ext);
    return {
      ext,
      unit: await unitPriceGbpForExternalId(payload, ext, row?.legacyExternalId),
    };
  });

  let totalGbp = 0;
  let pricedCardCount = 0;
  let missingPriceForId = 0;

  for (const { ext, unit } of unitPrices) {
    const qty = qtyByExternalId.get(ext)?.quantity ?? 0;
    if (unit === null) {
      missingPriceForId += 1;
      continue;
    }
    totalGbp += unit * qty;
    pricedCardCount += 1;
  }

  const hasIncompleteData =
    rowsWithoutExternalId > 0 || missingPriceForId > 0 || pricedCardCount < ids.length;

  return {
    totalGbp,
    pricedCardCount,
    attemptedCardCount: ids.length,
    hasIncompleteData,
  };
}
