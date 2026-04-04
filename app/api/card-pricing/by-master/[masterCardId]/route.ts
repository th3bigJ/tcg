import type { CardPricingGbpPayload } from "@/lib/liveCardPricingGbp";
import { cardPricingEntryToPayload } from "@/lib/cardPricingEntryToPayload";
import { getPricingForCard, getPricingForSet } from "@/lib/r2Pricing";
import { getCardMapById } from "@/lib/staticCardIndex";

const EMPTY: CardPricingGbpPayload = { tcgplayer: null, cardmarket: null, currency: "GBP" };
const CACHE_HEADERS = { "Cache-Control": "s-maxage=21600, stale-while-revalidate" };

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

    const resolved = await cardPricingEntryToPayload(entry.tcgplayer, entry.cardmarket, entry.scrydex);
    return Response.json(resolved ?? EMPTY, { headers: CACHE_HEADERS });
  } catch {
    return Response.json(EMPTY, { headers: CACHE_HEADERS });
  }
}
