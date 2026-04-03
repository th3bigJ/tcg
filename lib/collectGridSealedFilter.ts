import type { CollectGridSealedRow } from "@/lib/collectGridSealed";

export function filterCollectGridSealedRows(
  rows: CollectGridSealedRow[],
  opts: {
    variant: "collection" | "wishlist";
    rarity: string;
    energy: string;
    category: string;
    excludeCommonUncommon: boolean;
    duplicatesOnly: boolean;
    ownedFilterOnly: boolean;
    excludeCollected: boolean;
    viewerOwnedSealedProductIds?: Set<number>;
    collectionSealedProductIds?: Set<number>;
  },
): CollectGridSealedRow[] {
  const cardOnlyFilters =
    Boolean(opts.rarity) ||
    Boolean(opts.energy) ||
    Boolean(opts.category) ||
    opts.excludeCommonUncommon;
  if (cardOnlyFilters) return [];

  let out = rows;

  if (opts.duplicatesOnly) {
    if (opts.variant === "collection") {
      out = out.filter((r) => r.totalQuantity > 1);
    } else {
      return [];
    }
  }

  if (opts.ownedFilterOnly && opts.viewerOwnedSealedProductIds) {
    out = out.filter((r) => opts.viewerOwnedSealedProductIds!.has(r.sealedProductId));
  }

  if (opts.excludeCollected && opts.variant === "wishlist" && opts.collectionSealedProductIds) {
    out = out.filter((r) => !opts.collectionSealedProductIds!.has(r.sealedProductId));
  }

  return out;
}
