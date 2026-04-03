import { revalidatePath } from "next/cache";
import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { getProductTypeBySlug } from "@/lib/referenceData";
import {
  findShopSealedProductById,
  getSealedProductCatalog,
  getSealedProductPrices,
  mergeSealedProductsWithPrices,
  suggestedProductTypeIdForSealedProduct,
} from "@/lib/r2SealedProducts";
import { fetchSealedStateByCollectionIdFromTransactions } from "@/lib/sealedCustomerItemsServer";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

function revalidateSealedSurfaces() {
  revalidatePath("/collect");
  revalidatePath("/wishlist");
  revalidatePath("/account/transactions");
}

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("customer_sealed_collections")
    .select("id, sealed_product_id, quantity, purchase_type, price_paid, added_at")
    .eq("customer_id", customer.id)
    .order("added_at", { ascending: false })
    .limit(2000);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 500 });
  }

  const sealedStateByLineId = await fetchSealedStateByCollectionIdFromTransactions(customer.id);

  const docs = (data ?? []).map((row) => {
    const id = String(row.id);
    return {
      id,
      sealedProductId: row.sealed_product_id as number,
      quantity: row.quantity,
      sealedState: sealedStateByLineId.get(id) ?? ("sealed" as const),
      purchaseType: row.purchase_type as string | null,
      pricePaid: row.price_paid as number | null,
      addedAt: row.added_at as string | null,
    };
  });

  return jsonResponseWithAuthCookies({ docs }, authCookieResponse);
}

type SealedCollectionPostBody = {
  sealedProductId?: number;
  quantity?: number;
  purchaseType?: string | null;
  pricePaid?: number | null;
  purchaseDate?: string | null;
};

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: SealedCollectionPostBody;
  try {
    body = (await request.json()) as SealedCollectionPostBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const sealedProductId =
    typeof body.sealedProductId === "number" && Number.isFinite(body.sealedProductId) && body.sealedProductId > 0
      ? Math.floor(body.sealedProductId)
      : 0;
  if (!sealedProductId) {
    return jsonResponseWithAuthCookies({ error: "sealedProductId is required" }, authCookieResponse, { status: 400 });
  }

  const quantity =
    typeof body.quantity === "number" && Number.isFinite(body.quantity) && body.quantity >= 1
      ? Math.floor(body.quantity)
      : 1;

  const purchaseType =
    body.purchaseType === "packed" || body.purchaseType === "bought" || body.purchaseType === "traded"
      ? body.purchaseType
      : null;

  const pricePaid =
    purchaseType === "bought" && typeof body.pricePaid === "number" && Number.isFinite(body.pricePaid) && body.pricePaid >= 0
      ? body.pricePaid
      : null;

  const purchaseDate =
    purchaseType === "bought" && typeof body.purchaseDate === "string" && body.purchaseDate.trim()
      ? new Date(body.purchaseDate).toISOString()
      : null;

  const [catalog, prices] = await Promise.all([getSealedProductCatalog(), getSealedProductPrices()]);
  const merged = mergeSealedProductsWithPrices(catalog, prices);
  const product = findShopSealedProductById(merged, sealedProductId);
  if (!product) {
    return jsonResponseWithAuthCookies({ error: "Unknown sealed product" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const baseRow: Record<string, unknown> = {
    customer_id: customer.id,
    sealed_product_id: sealedProductId,
    quantity: 1,
    purchase_type: purchaseType,
    price_paid: pricePaid,
    added_at: purchaseDate ?? new Date().toISOString(),
  };

  const insertRows = Array.from({ length: quantity }, () => ({ ...baseRow }));
  const { data: createdRows, error } = await supabase
    .from("customer_sealed_collections")
    .insert(insertRows)
    .select();

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  let removedWishlist = false;
  try {
    const { error: wishErr } = await supabase
      .from("customer_sealed_wishlists")
      .delete()
      .eq("customer_id", customer.id)
      .eq("sealed_product_id", sealedProductId);
    removedWishlist = !wishErr;
  } catch {
    removedWishlist = false;
  }

  if (purchaseType === "bought" && pricePaid !== null) {
    const slug = suggestedProductTypeIdForSealedProduct(product);
    const pt = getProductTypeBySlug(slug) ?? getProductTypeBySlug("other");
    if (pt) {
      const firstEntryId = createdRows?.[0]?.id;
      const sourceRef =
        firstEntryId !== undefined && firstEntryId !== null
          ? `sealed-collection:${String(firstEntryId)}`
          : null;
      const { error: txErr } = await supabase.from("account_transactions").insert({
        customer_id: customer.id,
        direction: "purchase",
        product_type_id: pt.id,
        description: product.name,
        master_card_id: null,
        quantity,
        unit_price: pricePaid,
        transaction_date: purchaseDate ? purchaseDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        sealed_state: "sealed",
        source_reference: sourceRef ?? `sealed-product:${sealedProductId}`,
      });
      if (txErr) {
        console.error("[account_transactions] sealed collection purchase log failed:", txErr);
      }
    }
  }

  revalidateSealedSurfaces();
  const docs = createdRows ?? [];
  const doc = docs[0] ?? null;
  return jsonResponseWithAuthCookies({ doc, docs, removedWishlist }, authCookieResponse);
}

type SealedCollectionPatchBody = {
  id?: string;
  sealedState?: "opened";
};

export async function PATCH(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: SealedCollectionPatchBody;
  try {
    body = (await request.json()) as SealedCollectionPatchBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return jsonResponseWithAuthCookies({ error: "id is required" }, authCookieResponse, { status: 400 });
  }
  if (body.sealedState !== "opened") {
    return jsonResponseWithAuthCookies(
      { error: "sealedState must be \"opened\"" },
      authCookieResponse,
      { status: 400 },
    );
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const { data: row, error: fetchErr } = await supabase
    .from("customer_sealed_collections")
    .select("id, sealed_product_id, quantity, purchase_type, price_paid, added_at")
    .eq("id", id)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (fetchErr || !row) {
    return jsonResponseWithAuthCookies({ error: "Not found" }, authCookieResponse, { status: 404 });
  }

  const sourceRef = `sealed-collection:${id}`;
  const { data: tx, error: txFetchErr } = await supabase
    .from("account_transactions")
    .select("id, sealed_state")
    .eq("customer_id", customer.id)
    .eq("source_reference", sourceRef)
    .maybeSingle();

  if (txFetchErr) {
    return jsonResponseWithAuthCookies({ error: txFetchErr.message }, authCookieResponse, { status: 500 });
  }
  if (!tx) {
    return jsonResponseWithAuthCookies(
      {
        error:
          "No purchase transaction is linked to this copy (opened state is stored on transactions). Add it with a price or create a matching transaction.",
      },
      authCookieResponse,
      { status: 422 },
    );
  }
  if (tx.sealed_state === "opened") {
    return jsonResponseWithAuthCookies({ error: "Already opened" }, authCookieResponse, { status: 409 });
  }

  const { error: txUpdateErr } = await supabase
    .from("account_transactions")
    .update({ sealed_state: "opened" })
    .eq("id", tx.id)
    .eq("customer_id", customer.id);

  if (txUpdateErr) {
    return jsonResponseWithAuthCookies({ error: txUpdateErr.message }, authCookieResponse, { status: 422 });
  }

  /** Remove this copy from sealed inventory; purchase history stays on `account_transactions` (now opened). */
  const { error: deleteErr } = await supabase
    .from("customer_sealed_collections")
    .delete()
    .eq("id", id)
    .eq("customer_id", customer.id);

  if (deleteErr) {
    return jsonResponseWithAuthCookies({ error: deleteErr.message }, authCookieResponse, { status: 422 });
  }

  revalidateSealedSurfaces();
  return jsonResponseWithAuthCookies(
    {
      ok: true,
      opened: true,
      removedCollectionId: id,
      sealedProductId: row.sealed_product_id as number,
      transactionId: tx.id,
    },
    authCookieResponse,
  );
}

export async function DELETE(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return jsonResponseWithAuthCookies({ error: "id query parameter is required" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { error } = await supabase
    .from("customer_sealed_collections")
    .delete()
    .eq("id", id)
    .eq("customer_id", customer.id);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  revalidateSealedSurfaces();
  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
