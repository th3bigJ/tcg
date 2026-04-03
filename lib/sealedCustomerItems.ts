import type { ShopSealedProduct } from "@/lib/r2SealedProducts";

export type SealedCollectionLine = {
  id: string;
  sealedProductId: number;
  quantity: number;
  /** Derived from `account_transactions` when `source_reference` is `sealed-collection:<this id>`. */
  sealedState: "sealed" | "opened";
  purchaseType: "packed" | "bought" | "traded" | null;
  pricePaid: number | null;
  addedAt: string | null;
};

export type SealedWishlistLine = {
  id: string;
  sealedProductId: number;
  priority: "low" | "medium" | "high";
  maxPrice: number | null;
  addedAt: string | null;
};

export type SealedCollectionGridItem = {
  sealedProductId: number;
  product: ShopSealedProduct | null;
  entryIds: string[];
  totalQuantity: number;
  /** Copies still sealed (market value for sealed inventory). */
  sealedQuantity: number;
  /** Copies marked opened. */
  openedQuantity: number;
  /** Collection row IDs that are still sealed (use for “mark opened”). */
  sealedEntryIds: string[];
  /** Latest `added_at` among merged lines (for sort). */
  newestAddedAt: string | null;
};

export function mergeSealedCollectionForGrid(
  lines: SealedCollectionLine[],
  productsById: Map<number, ShopSealedProduct>,
): SealedCollectionGridItem[] {
  const byProduct = new Map<
    number,
    {
      entryIds: string[];
      sealedEntryIds: string[];
      qty: number;
      sealedQty: number;
      openedQty: number;
      newestAddedAt: string | null;
    }
  >();
  for (const line of lines) {
    const pid = line.sealedProductId;
    const q = line.quantity >= 1 ? line.quantity : 1;
    const opened = line.sealedState === "opened";
    const agg =
      byProduct.get(pid) ?? {
        entryIds: [],
        sealedEntryIds: [],
        qty: 0,
        sealedQty: 0,
        openedQty: 0,
        newestAddedAt: null as string | null,
      };
    agg.entryIds.push(line.id);
    agg.qty += q;
    if (opened) {
      agg.openedQty += q;
    } else {
      agg.sealedQty += q;
      agg.sealedEntryIds.push(line.id);
    }
    const ad = line.addedAt;
    if (ad && (!agg.newestAddedAt || ad > agg.newestAddedAt)) agg.newestAddedAt = ad;
    byProduct.set(pid, agg);
  }
  return Array.from(byProduct.entries()).map(([sealedProductId, agg]) => ({
    sealedProductId,
    product: productsById.get(sealedProductId) ?? null,
    entryIds: agg.entryIds,
    totalQuantity: agg.qty,
    sealedQuantity: agg.sealedQty,
    openedQuantity: agg.openedQty,
    sealedEntryIds: agg.sealedEntryIds,
    newestAddedAt: agg.newestAddedAt,
  }));
}

export function mapSealedWishlistLinesToGrid(
  lines: SealedWishlistLine[],
  productsById: Map<number, ShopSealedProduct>,
): Array<{
  wishlistEntryId: string;
  sealedProductId: number;
  product: ShopSealedProduct | null;
  addedAt: string | null;
}> {
  return lines.map((line) => ({
    wishlistEntryId: line.id,
    sealedProductId: line.sealedProductId,
    product: productsById.get(line.sealedProductId) ?? null,
    addedAt: line.addedAt,
  }));
}
