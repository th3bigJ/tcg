import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getSealedProductCatalog,
  getSealedProductPrices,
  mergeSealedProductsWithPrices,
  type ShopSealedProduct,
} from "@/lib/r2SealedProducts";
import type { SealedCollectionLine, SealedWishlistLine } from "@/lib/sealedCustomerItems";

const PAGE_SIZE = 1000;

function parsePurchaseType(value: unknown): SealedCollectionLine["purchaseType"] {
  return value === "packed" || value === "bought" || value === "traded" ? value : null;
}

const SEALED_COLLECTION_REF_PREFIX = "sealed-collection:";

/** Opened vs sealed for each collection row id, from `account_transactions.sealed_state` + `source_reference`. */
export async function fetchSealedStateByCollectionIdFromTransactions(
  customerId: string,
): Promise<Map<string, SealedCollectionLine["sealedState"]>> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("account_transactions")
    .select("source_reference, sealed_state")
    .eq("customer_id", customerId)
    .limit(5000);

  const map = new Map<string, SealedCollectionLine["sealedState"]>();
  if (error || !data) return map;

  for (const row of data) {
    const ref = typeof row.source_reference === "string" ? row.source_reference : "";
    if (!ref.startsWith(SEALED_COLLECTION_REF_PREFIX)) continue;
    const id = ref.slice(SEALED_COLLECTION_REF_PREFIX.length).trim();
    if (!id) continue;
    map.set(id, row.sealed_state === "opened" ? "opened" : "sealed");
  }
  return map;
}

export async function fetchSealedCollectionLines(customerId: string): Promise<SealedCollectionLine[]> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("customer_sealed_collections")
      .select("id, sealed_product_id, quantity, purchase_type, price_paid, added_at")
      .eq("customer_id", customerId)
      .order("added_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data) break;
    for (const row of data) allRows.push(row as Record<string, unknown>);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const sealedStateByLineId = await fetchSealedStateByCollectionIdFromTransactions(customerId);

  return allRows.map((row) => {
    const id = String(row.id ?? "");
    return {
      id,
      sealedProductId: Number(row.sealed_product_id),
      quantity:
        typeof row.quantity === "number" && Number.isFinite(row.quantity) && row.quantity >= 1
          ? row.quantity
          : 1,
      sealedState: sealedStateByLineId.get(id) ?? "sealed",
      purchaseType: parsePurchaseType(row.purchase_type),
      pricePaid:
        typeof row.price_paid === "number" && Number.isFinite(row.price_paid) ? row.price_paid : null,
      addedAt: typeof row.added_at === "string" ? row.added_at : null,
    };
  });
}

export async function fetchSealedWishlistLines(customerId: string): Promise<SealedWishlistLine[]> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("customer_sealed_wishlists")
      .select("id, sealed_product_id, priority, max_price, added_at")
      .eq("customer_id", customerId)
      .order("added_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data) break;
    for (const row of data) allRows.push(row as Record<string, unknown>);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows.map((row) => {
    const p = row.priority;
    const priority: SealedWishlistLine["priority"] =
      p === "low" || p === "high" || p === "medium" ? p : "medium";
    return {
      id: String(row.id ?? ""),
      sealedProductId: Number(row.sealed_product_id),
      priority,
      maxPrice:
        typeof row.max_price === "number" && Number.isFinite(row.max_price) ? row.max_price : null,
      addedAt: typeof row.added_at === "string" ? row.added_at : null,
    };
  });
}

function shopSealedProductsMapForIds(
  merged: ShopSealedProduct[],
  ids: Iterable<number>,
): Map<number, ShopSealedProduct> {
  const want = new Set(ids);
  const map = new Map<number, ShopSealedProduct>();
  for (const p of merged) {
    if (want.has(p.id)) map.set(p.id, p);
  }
  return map;
}

export async function resolveSealedProductsByIds(ids: number[]): Promise<Map<number, ShopSealedProduct>> {
  if (ids.length === 0) return new Map();
  const [catalog, prices] = await Promise.all([getSealedProductCatalog(), getSealedProductPrices()]);
  const merged = mergeSealedProductsWithPrices(catalog, prices);
  return shopSealedProductsMapForIds(merged, ids);
}

export async function fetchSealedProductUserState(
  customerId: string,
  sealedProductId: number,
): Promise<{
  wishlistEntryId: string | null;
  collectionEntryIds: string[];
  totalQuantity: number;
}> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const [wishRes, colRes] = await Promise.all([
    supabase
      .from("customer_sealed_wishlists")
      .select("id")
      .eq("customer_id", customerId)
      .eq("sealed_product_id", sealedProductId)
      .maybeSingle(),
    supabase
      .from("customer_sealed_collections")
      .select("id, quantity")
      .eq("customer_id", customerId)
      .eq("sealed_product_id", sealedProductId)
      .order("added_at", { ascending: false }),
  ]);

  const wishlistEntryId = wishRes.data?.id != null ? String(wishRes.data.id) : null;
  const rows = colRes.data ?? [];
  const collectionEntryIds = rows.map((r) => String(r.id));
  const totalQuantity = rows.reduce((sum, r) => {
    const q = typeof r.quantity === "number" && Number.isFinite(r.quantity) && r.quantity >= 1 ? r.quantity : 1;
    return sum + q;
  }, 0);

  return { wishlistEntryId, collectionEntryIds, totalQuantity };
}
