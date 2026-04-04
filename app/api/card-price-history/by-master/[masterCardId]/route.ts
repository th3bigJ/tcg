import { getPriceHistoryForCard, getPriceHistoryForSet } from "@/lib/r2PriceHistory";
import { getCardMapById } from "@/lib/staticCardIndex";

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
    const card = getCardMapById().get(masterCardId);
    if (!card) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    const historyMap = await getPriceHistoryForSet(card.setCode);
    if (!historyMap) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    const ids = [card.externalId, card.tcgdex_id].filter((id): id is string => Boolean(id));
    if (ids.length === 0) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    const entry = getPriceHistoryForCard(historyMap, ids[0], ids.slice(1));
    if (!entry) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    return Response.json(entry, { headers: CACHE_HEADERS });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });
  }
}
