import type { CardPricingGbpPayload } from "@/lib/liveCardPricingGbp";
import { cardPricingEntryToPayload } from "@/lib/cardPricingEntryToPayload";
import { getPricingForCard, getPricingForSet } from "@/lib/r2Pricing";

const EMPTY: CardPricingGbpPayload = { tcgplayer: null, cardmarket: null, currency: "GBP" };
const CACHE_HEADERS = { "Cache-Control": "s-maxage=21600, stale-while-revalidate" };

function setCodeFromExternalId(id: string): string {
  const parts = id.split("-");
  return parts.length > 1 ? parts.slice(0, -1).join("-") : id;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ externalId: string }> },
) {
  const { externalId: raw } = await context.params;
  const externalId = decodeURIComponent(raw ?? "").trim();

  if (!externalId) {
    return Response.json(EMPTY, { headers: CACHE_HEADERS });
  }

  try {
    const setCodes = [...new Set([setCodeFromExternalId(externalId)])];

    for (const setCode of setCodes) {
      const pricingMap = await getPricingForSet(setCode);
      if (!pricingMap) continue;

      const entry = getPricingForCard(pricingMap, externalId);
      if (!entry) continue;

      const resolved = await cardPricingEntryToPayload(entry.tcgplayer, entry.cardmarket, entry.scrydex);
      if (resolved) return Response.json(resolved, { headers: CACHE_HEADERS });
    }

    return Response.json(EMPTY, { headers: CACHE_HEADERS });
  } catch {
    return Response.json(EMPTY, { headers: CACHE_HEADERS });
  }
}
