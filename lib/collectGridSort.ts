/**
 * Global price order for collect / wishlist grids (highest first).
 * Must match the client sort in CollectCardGridWithTags for `price-desc`.
 */
export function sortCollectGridRowsByPriceDesc<T extends { masterCardId?: string; collectionGroupKey?: string }>(
  rows: T[],
  prices: Record<string, number>,
): T[] {
  return [...rows].sort((a, b) => {
    const ka = a.collectionGroupKey ?? a.masterCardId ?? "";
    const kb = b.collectionGroupKey ?? b.masterCardId ?? "";
    const pa = (ka ? prices[ka] : undefined) ?? 0;
    const pb = (kb ? prices[kb] : undefined) ?? 0;
    return pb - pa;
  });
}
