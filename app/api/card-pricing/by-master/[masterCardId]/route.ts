import type { CardPricingGbpPayload } from "@/lib/liveCardPricingGbp";
import { getPricingForCard, getPricingForSet } from "@/lib/r2Pricing";
import { getCardMapById } from "@/lib/staticCardIndex";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { extractTcgplayerMarketPricesGbp, extractCardmarketAvgsGbp } from "@/lib/catalogPricingExtract";

const EMPTY: CardPricingGbpPayload = { tcgplayer: null, cardmarket: null, currency: "GBP" };
const CACHE_HEADERS = { "Cache-Control": "s-maxage=21600, stale-while-revalidate" };

async function entryToPayload(
  tcgplayer: unknown,
  cardmarket: unknown,
  scrydex: unknown,
): Promise<CardPricingGbpPayload | null> {
  const m = await fetchGbpConversionMultipliers();
  const tp = extractTcgplayerMarketPricesGbp(tcgplayer, m);
  const cm = extractCardmarketAvgsGbp(cardmarket, m);
  const tpFlat = tp && Object.keys(tp).length > 0 ? tp : null;
  const cmFlat = cm && Object.keys(cm).length > 0 ? cm : null;

  const tcgplayerOut: Record<string, unknown> = {};
  if (tpFlat) {
    for (const [k, v] of Object.entries(tpFlat as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) tcgplayerOut[k] = { market: v, marketPrice: v };
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

  // Fall back to Scrydex: { [variant]: { raw: number } } — raw is already GBP
  if (Object.keys(tcgplayerOut).length === 0 && Object.keys(cardmarketOut).length === 0) {
    const sc = scrydex && typeof scrydex === "object" ? (scrydex as Record<string, unknown>) : null;
    if (sc) {
      for (const [variant, block] of Object.entries(sc)) {
        if (!block || typeof block !== "object") continue;
        const r = (block as Record<string, unknown>).raw;
        if (typeof r === "number" && Number.isFinite(r)) {
          tcgplayerOut[variant] = { market: r, marketPrice: r };
        }
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ masterCardId: string }> },
) {
  const { masterCardId: raw } = await context.params;
  const masterCardId = decodeURIComponent(raw ?? "").trim();
  if (!masterCardId) {
    return Response.json(EMPTY, { headers: CACHE_HEADERS });
  }

  try {
    const card = getCardMapById().get(masterCardId);
    if (!card) return Response.json(EMPTY, { headers: CACHE_HEADERS });

    const pricingMap = await getPricingForSet(card.setCode);
    if (!pricingMap) return Response.json(EMPTY, { headers: CACHE_HEADERS });

    const ids = [card.externalId, card.tcgdex_id].filter((id): id is string => Boolean(id));
    if (ids.length === 0) return Response.json(EMPTY, { headers: CACHE_HEADERS });

    const entry = getPricingForCard(pricingMap, ids[0], ids.slice(1));
    if (!entry) return Response.json(EMPTY, { headers: CACHE_HEADERS });

    const resolved = await entryToPayload(entry.tcgplayer, entry.cardmarket, entry.scrydex);
    return Response.json(resolved ?? EMPTY, { headers: CACHE_HEADERS });
  } catch {
    return Response.json(EMPTY, { headers: CACHE_HEADERS });
  }
}
