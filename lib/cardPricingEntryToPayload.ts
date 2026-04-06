import type { CardPricingGbpPayload } from "@/lib/liveCardPricingGbp";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { extractTcgplayerMarketPricesGbp, extractCardmarketAvgsGbp } from "@/lib/catalogPricingExtract";

/**
 * Builds the JSON returned by `/api/card-pricing/*` and `/api/card-prices/*`.
 * Merges **all** Scrydex variant rows (stamps, promos, etc.) even when TCGPlayer USD only lists e.g. `normal`,
 * so the UI can offer every priced variant for collection / wishlist.
 */
export async function cardPricingEntryToPayload(
  tcgplayer: unknown,
  cardmarket: unknown,
  scrydex: unknown,
): Promise<CardPricingGbpPayload | null> {
  const m = await fetchGbpConversionMultipliers();
  const tp = extractTcgplayerMarketPricesGbp(tcgplayer, m);
  const cm = extractCardmarketAvgsGbp(cardmarket, m);
  const tpFlat = tp && Object.keys(tp).length > 0 ? tp : null;
  const cmFlat = cm && Object.keys(cm).length > 0 ? cm : null;

  const sc = scrydex && typeof scrydex === "object" ? (scrydex as Record<string, unknown>) : null;

  const tcgplayerOut: Record<string, unknown> = {};
  if (tpFlat) {
    for (const [k, v] of Object.entries(tpFlat as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        const scBlock = sc?.[k];
        const scB = scBlock && typeof scBlock === "object" ? (scBlock as Record<string, unknown>) : null;
        const psa10Usd = scB?.psa10;
        const ace10Usd = scB?.ace10;
        const psa10 =
          typeof psa10Usd === "number" && Number.isFinite(psa10Usd) ? psa10Usd * m.usdToGbp : undefined;
        const ace10 =
          typeof ace10Usd === "number" && Number.isFinite(ace10Usd) ? ace10Usd * m.usdToGbp : undefined;
        tcgplayerOut[k] = {
          market: v,
          marketPrice: v,
          ...(psa10 !== undefined ? { psa10 } : {}),
          ...(ace10 !== undefined ? { ace10 } : {}),
        };
      }
    }
  }

  const cardmarketOut: Record<string, unknown> = {};
  if (cmFlat) {
    const c = cmFlat as Record<string, unknown>;
    const avg = c.avg;
    if (typeof avg === "number" && Number.isFinite(avg)) {
      cardmarketOut.trend = avg;
      cardmarketOut.avg30 = avg;
      cardmarketOut.trendPrice = avg;
    }
  }

  // Scrydex-only variants (e.g. Pokémon Center stamps) not present in TCGPlayer USD extraction.
  if (sc) {
    for (const [variant, block] of Object.entries(sc)) {
      if (tcgplayerOut[variant] !== undefined) continue;
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const rUsd = typeof b.raw === "number" && Number.isFinite(b.raw) ? b.raw : undefined;
      const psa10Usd = typeof b.psa10 === "number" && Number.isFinite(b.psa10) ? b.psa10 : undefined;
      const ace10Usd = typeof b.ace10 === "number" && Number.isFinite(b.ace10) ? b.ace10 : undefined;
      const r = rUsd !== undefined ? rUsd * m.usdToGbp : undefined;
      const psa10 = psa10Usd !== undefined ? psa10Usd * m.usdToGbp : undefined;
      const ace10 = ace10Usd !== undefined ? ace10Usd * m.usdToGbp : undefined;
      if (r !== undefined || psa10 !== undefined || ace10 !== undefined) {
        tcgplayerOut[variant] = {
          ...(r !== undefined ? { market: r, marketPrice: r } : {}),
          ...(psa10 !== undefined ? { psa10 } : {}),
          ...(ace10 !== undefined ? { ace10 } : {}),
        };
      }
    }
  }

  if (Object.keys(tcgplayerOut).length === 0 && Object.keys(cardmarketOut).length === 0) return null;
  return {
    tcgplayer: Object.keys(tcgplayerOut).length > 0 ? tcgplayerOut : null,
    cardmarket: Object.keys(cardmarketOut).length > 0 ? cardmarketOut : null,
    currency: "GBP",
  };
}
