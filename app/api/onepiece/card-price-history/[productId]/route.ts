import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { loadOnePieceHistoryForSet } from "@/lib/onepiecePricing";
import { scaleCardPriceHistoryUsdToGbpForDisplay } from "@/lib/pricingUsdStorageDisplay";
import type { CardPriceHistory } from "@/lib/staticDataTypes";

const CACHE_HEADERS = { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" };

function normalizeVariant(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "normal";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const { productId: rawProductId } = await context.params;
  const productId = decodeURIComponent(rawProductId ?? "").trim();
  const { searchParams } = new URL(request.url);
  const setCode = searchParams.get("set")?.trim().toUpperCase() ?? "";
  const variant = normalizeVariant(searchParams.get("variant"));

  if (!productId || !setCode) {
    return Response.json({ error: "Missing productId or set" }, { status: 400, headers: CACHE_HEADERS });
  }

  try {
    const historyMap = await loadOnePieceHistoryForSet(setCode);
    const entry = historyMap[productId];
    if (!entry) {
      return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });
    }

    const normalized: CardPriceHistory = {
      [variant]: entry.default?.raw ? { raw: entry.default.raw } : {},
    };
    const { usdToGbp } = await fetchGbpConversionMultipliers();
    return Response.json(scaleCardPriceHistoryUsdToGbpForDisplay(normalized, usdToGbp), { headers: CACHE_HEADERS });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404, headers: CACHE_HEADERS });
  }
}
