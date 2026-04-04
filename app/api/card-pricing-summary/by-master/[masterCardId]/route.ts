import { fetchPriceSummariesForMasterCardIds } from "@/lib/cardPricingBulk";

const EMPTY = { price: null, trend: null };
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
    const { prices, trends } = await fetchPriceSummariesForMasterCardIds([masterCardId]);
    return Response.json(
      {
        price: prices[masterCardId] ?? null,
        trend: trends[masterCardId] ?? null,
      },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return Response.json(EMPTY, { headers: CACHE_HEADERS });
  }
}
