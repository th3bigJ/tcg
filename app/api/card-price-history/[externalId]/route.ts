import { getPriceHistoryForCard, getPriceHistoryForSet } from "@/lib/r2PriceHistory";
import { setCodeFromExternalId } from "@/lib/r2Pricing";

const CACHE_HEADERS = { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" };

export async function GET(
  request: Request,
  context: { params: Promise<{ externalId: string }> },
) {
  const { externalId: raw } = await context.params;
  const externalId = decodeURIComponent(raw ?? "").trim();
  const fallbackExternalId =
    new URL(request.url).searchParams.get("fallbackExternalId")?.trim() ?? "";

  if (!externalId) {
    return Response.json({ error: "Missing externalId" }, { status: 400, headers: CACHE_HEADERS });
  }

  try {
    const ids = [...new Set([externalId, fallbackExternalId].filter(Boolean))];
    const setCodes = [...new Set(ids.map(setCodeFromExternalId).filter(Boolean))];

    for (const setCode of setCodes) {
      const historyMap = await getPriceHistoryForSet(setCode);
      if (!historyMap) continue;

      const entry = getPriceHistoryForCard(historyMap, ids[0], ids.slice(1));
      if (entry) return Response.json(entry, { headers: CACHE_HEADERS });
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });
  }
}
