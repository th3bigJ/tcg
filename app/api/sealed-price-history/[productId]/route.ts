import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { scaleSealedProductPriceHistoryUsdToGbpForDisplay } from "@/lib/pricingUsdStorageDisplay";
import { getSealedPriceHistory, getSealedPriceHistoryForProduct } from "@/lib/r2SealedPriceHistory";

const CACHE_HEADERS = { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const { productId: raw } = await context.params;
  const productId = decodeURIComponent(raw ?? "").trim();
  if (!productId) {
    return Response.json({ error: "Missing productId" }, { status: 400, headers: CACHE_HEADERS });
  }

  try {
    const { usdToGbp } = await fetchGbpConversionMultipliers();
    const historyMap = await getSealedPriceHistory();
    if (!historyMap) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    const entry = getSealedPriceHistoryForProduct(historyMap, productId);
    if (!entry) return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });

    return Response.json(scaleSealedProductPriceHistoryUsdToGbpForDisplay(entry, usdToGbp), {
      headers: CACHE_HEADERS,
    });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });
  }
}
