import type { CardPricingGbpPayload } from "@/lib/liveCardPricingGbp";

import {
  extractCardmarketAvgsGbp,
  extractTcgplayerMarketPricesGbp,
} from "@/lib/catalogPricingExtract";
import type { GbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";

function isScrydexMetadataExternalPricing(ep: Record<string, unknown>): boolean {
  return ep.source === "scrydex";
}

/**
 * Rebuild the storefront `/api/card-prices` shape from `catalog-card-pricing`:
 * TCGdex GBP from `externalPricing` raw blocks + live FX; Scrydex scrape from `externalPrice` (nested `{ variant: { raw, psa10 } }` or legacy flat numbers).
 */
export async function catalogDocToCardPricingGbpPayload(
  doc: Record<string, unknown>,
  multipliers?: GbpConversionMultipliers,
): Promise<CardPricingGbpPayload | null> {
  const m = multipliers ?? (await fetchGbpConversionMultipliers());

  let tpFlat: unknown = null;
  let cmFlat: unknown = null;
  const epRaw = doc.externalPricing ?? doc.external_pricing;
  if (epRaw && typeof epRaw === "object") {
    const ep = epRaw as Record<string, unknown>;
    if (!isScrydexMetadataExternalPricing(ep)) {
      const tp = extractTcgplayerMarketPricesGbp(ep.tcgplayer, m);
      const cm = extractCardmarketAvgsGbp(ep.cardmarket, m);
      tpFlat = tp && Object.keys(tp).length > 0 ? tp : null;
      cmFlat = cm && Object.keys(cm).length > 0 ? cm : null;
    }
  }

  const extFlat = (doc.externalPrice ?? doc.external_price) as unknown;

  const tcgplayer: Record<string, unknown> = {};
  if (tpFlat && typeof tpFlat === "object") {
    for (const [k, v] of Object.entries(tpFlat as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        tcgplayer[k] = { market: v, marketPrice: v };
      }
    }
  }
  if (extFlat && typeof extFlat === "object") {
    const ext = extFlat as Record<string, unknown>;
    const sample = Object.values(ext)[0];
    const nestedExternal =
      sample !== undefined &&
      typeof sample === "object" &&
      !Array.isArray(sample) &&
      ("raw" in sample || "psa10" in sample);

    if (nestedExternal) {
      for (const [variantKey, rec] of Object.entries(ext)) {
        if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
        if (tcgplayer[variantKey] !== undefined) continue;
        const o = rec as Record<string, unknown>;
        const raw = o.raw;
        const psa10 = o.psa10;
        const block: Record<string, unknown> = {};
        if (typeof raw === "number" && Number.isFinite(raw)) {
          block.market = raw;
          block.marketPrice = raw;
        }
        if (typeof psa10 === "number" && Number.isFinite(psa10)) {
          block.psa10 = psa10;
        }
        if (Object.keys(block).length > 0) {
          tcgplayer[variantKey] = block;
        }
      }
    } else {
      for (const [k, v] of Object.entries(ext)) {
        if (typeof v === "number" && Number.isFinite(v) && tcgplayer[k] === undefined) {
          tcgplayer[k] = { market: v, marketPrice: v };
        }
      }
    }
  }

  const cardmarket: Record<string, unknown> = {};
  if (cmFlat && typeof cmFlat === "object") {
    const cm = cmFlat as Record<string, unknown>;
    const avg = cm.avg;
    if (typeof avg === "number" && Number.isFinite(avg)) {
      cardmarket.trend = avg;
      cardmarket.avg30 = avg;
      cardmarket.trendPrice = avg;
    }
    const holo = cm["avg-holo"];
    if (typeof holo === "number" && Number.isFinite(holo)) {
      cardmarket["avg-holo"] = holo;
      cardmarket["trend-holo"] = holo;
    }
  }

  if (Object.keys(tcgplayer).length === 0 && Object.keys(cardmarket).length === 0) return null;

  return {
    tcgplayer: Object.keys(tcgplayer).length > 0 ? tcgplayer : null,
    cardmarket: Object.keys(cardmarket).length > 0 ? cardmarket : null,
    currency: "GBP",
  };
}
