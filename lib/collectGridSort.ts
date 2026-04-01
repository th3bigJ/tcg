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

type SetSortableRow = {
  set?: string | null;
  setReleaseDate?: string | null;
};

export function paginateRowsByFullSets<T extends SetSortableRow>(
  rows: T[],
  setTake: number,
): {
  rowsForPage: T[];
  totalSetCount: number;
  showingSetCount: number;
  hasMoreSets: boolean;
} {
  const groupMap = new Map<string, T[]>();

  for (const row of rows) {
    const setCode = row.set?.trim() || "__unknown_set__";
    const existing = groupMap.get(setCode);
    if (existing) {
      existing.push(row);
    } else {
      groupMap.set(setCode, [row]);
    }
  }

  const orderedSetCodes = [...groupMap.keys()].sort((a, b) => {
    const dateA = groupMap.get(a)?.[0]?.setReleaseDate ?? "";
    const dateB = groupMap.get(b)?.[0]?.setReleaseDate ?? "";
    return dateB.localeCompare(dateA);
  });

  const clampedSetTake = Math.max(1, Math.min(setTake, orderedSetCodes.length || 1));
  const visibleSetCodes = orderedSetCodes.slice(0, clampedSetTake);
  const rowsForPage = visibleSetCodes.flatMap((setCode) => groupMap.get(setCode) ?? []);

  return {
    rowsForPage,
    totalSetCount: orderedSetCodes.length,
    showingSetCount: visibleSetCodes.length,
    hasMoreSets: clampedSetTake < orderedSetCodes.length,
  };
}
