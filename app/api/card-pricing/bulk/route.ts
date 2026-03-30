import { fetchPricesForMasterCardIds } from "@/lib/cardPricingBulk";

/**
 * POST /api/card-pricing/bulk
 * Body: { masterCardIds: string[] }
 * Returns: { prices: Record<string, number> }  — masterCardId → GBP price (only priced cards included)
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids: string[] =
    Array.isArray((body as Record<string, unknown>)?.masterCardIds)
      ? ((body as Record<string, unknown>).masterCardIds as unknown[])
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .map((v) => v.trim())
          .slice(0, 300)
      : [];

  if (ids.length === 0) {
    return Response.json({ prices: {} });
  }

  const prices = await fetchPricesForMasterCardIds(ids);

  return Response.json({ prices }, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate" },
  });
}
