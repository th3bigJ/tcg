import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import type { ShopSealedProduct } from "@/lib/r2SealedProducts";

const gbpFmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/** Single-unit market estimate for grid labels (USD catalog → GBP). */
export function formatSealedUnitPriceGbp(product: ShopSealedProduct | null, usdToGbp: number): string | null {
  const mv = product?.marketValue;
  if (typeof mv !== "number" || !Number.isFinite(mv) || mv <= 0) return null;
  return gbpFmt.format(mv * usdToGbp);
}

/** GBP unit price for sorting merged card + sealed grids (0 when unknown). */
export function sealedUnitPriceSortGbp(product: ShopSealedProduct | null, usdToGbp: number): number {
  const mv = product?.marketValue;
  if (typeof mv !== "number" || !Number.isFinite(mv) || mv <= 0) return 0;
  return mv * usdToGbp;
}

/**
 * Sums sealed catalog USD market values × quantity, converted to GBP.
 * Skips rows with missing or non-positive market values.
 * @param preloadedUsdToGbp avoids a second FX fetch when you already have multipliers.
 */
export async function estimateSealedMarketValueGbp(
  rows: Array<{ product: ShopSealedProduct | null; quantity: number }>,
  preloadedUsdToGbp?: number,
): Promise<number> {
  if (rows.length === 0) return 0;
  const usdToGbp =
    typeof preloadedUsdToGbp === "number" && Number.isFinite(preloadedUsdToGbp) && preloadedUsdToGbp > 0
      ? preloadedUsdToGbp
      : (await fetchGbpConversionMultipliers()).usdToGbp;
  let total = 0;
  for (const row of rows) {
    const mv = row.product?.marketValue;
    if (typeof mv !== "number" || !Number.isFinite(mv) || mv <= 0) continue;
    const q = row.quantity >= 1 ? row.quantity : 1;
    total += mv * usdToGbp * q;
  }
  return total;
}
