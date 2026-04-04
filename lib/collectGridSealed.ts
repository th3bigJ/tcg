import type { SealedProductPriceTrendSummary } from "@/lib/staticDataTypes";

/** Sealed row merged into collect / wishlist card grids (same filters + sort as cards). */
export type CollectGridSealedRow = {
  sealedProductId: number;
  source: "collection" | "wishlist";
  wishlistEntryId?: string;
  entryIds?: string[];
  totalQuantity: number;
  sealedQuantity: number;
  openedQuantity: number;
  /** Row IDs still sealed; first is opened by “Mark as opened” when multiple lines exist. */
  sealedEntryIds: string[];
  name: string;
  imageUrl: string | null;
  series: string | null;
  priceLabel: string | null;
  /** For price sort interleaving with cards (GBP). */
  priceSortGbp: number;
  trend?: SealedProductPriceTrendSummary | null;
  releaseDate: string | null;
  addedAt: string | null;
};

export type CollectMergedFlatRow =
  | { kind: "card"; cardIndex: number }
  | { kind: "sealed"; row: CollectGridSealedRow };
