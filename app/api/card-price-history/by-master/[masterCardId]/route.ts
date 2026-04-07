import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { scaleCardPriceHistoryUsdToGbpForDisplay } from "@/lib/pricingUsdStorageDisplay";
import { getPriceHistoryForCard, getPriceHistoryForSet } from "@/lib/r2PriceHistory";
import { resolvePricingExternalId } from "@/lib/cardPricingBulk";
import { getCardMapById } from "@/lib/staticCardIndex";
import type { CardPriceHistory } from "@/lib/staticDataTypes";

const CACHE_HEADERS = { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ masterCardId: string }> },
) {
  const { masterCardId: raw } = await context.params;
  const masterCardId = decodeURIComponent(raw ?? "").trim();
  if (!masterCardId) {
    return Response.json({ error: "Missing masterCardId" }, { status: 400, headers: CACHE_HEADERS });
  }

  try {
    const { usdToGbp } = await fetchGbpConversionMultipliers();
    const card = getCardMapById().get(masterCardId);
    if (!card) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    const historyMap = await getPriceHistoryForSet(card.setCode);
    if (!historyMap) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    const externalId = resolvePricingExternalId(card);
    if (!externalId) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    const entry = getPriceHistoryForCard(historyMap, externalId);
    if (!entry) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    const gbp: CardPriceHistory = scaleCardPriceHistoryUsdToGbpForDisplay(entry, usdToGbp);
    return Response.json(gbp, { headers: CACHE_HEADERS });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });
  }
}
