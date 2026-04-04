import { fetchPriceSummariesForMasterCardIds } from "@/lib/cardPricingBulk";

/**
 * POST /api/card-pricing/bulk
 * Body: { masterCardIds: string[] }
 * Returns: { prices, trends }  — compact per-card grid pricing/trend summaries
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
    return Response.json({ prices: {}, trends: {} });
  }

  const summary = await fetchPriceSummariesForMasterCardIds(ids);

  return Response.json(summary, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate" },
  });
}
