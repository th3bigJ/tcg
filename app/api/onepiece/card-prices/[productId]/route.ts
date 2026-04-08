import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { loadOnePieceMarketForSet } from "@/lib/onepiecePricing";

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
    return Response.json({ tcgplayer: null, cardmarket: null, currency: "GBP" }, { headers: CACHE_HEADERS });
  }

  try {
    const marketMap = await loadOnePieceMarketForSet(setCode);
    const entry = marketMap[productId];
    const market = entry?.tcgplayer;
    const { usdToGbp } = await fetchGbpConversionMultipliers();

    const priceBlock =
      market && typeof market.marketPrice === "number" && Number.isFinite(market.marketPrice)
        ? {
            market: market.marketPrice * usdToGbp,
            marketPrice: market.marketPrice * usdToGbp,
          }
        : null;

    return Response.json(
      {
        tcgplayer: priceBlock ? { [variant]: priceBlock } : null,
        cardmarket: null,
        currency: "GBP",
      },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return Response.json({ tcgplayer: null, cardmarket: null, currency: "GBP" }, { headers: CACHE_HEADERS });
  }
}
