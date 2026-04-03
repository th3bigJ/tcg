import { revalidatePath } from "next/cache";
import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

function revalidateSealedWishlistSurfaces() {
  revalidatePath("/wishlist");
  revalidatePath("/collect");
  revalidatePath("/search");
}

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("customer_sealed_wishlists")
    .select("id, sealed_product_id, priority, max_price, added_at")
    .eq("customer_id", customer.id)
    .order("added_at", { ascending: false })
    .limit(2000);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 500 });
  }

  const docs = (data ?? []).map((row) => ({
    id: String(row.id),
    sealedProductId: row.sealed_product_id as number,
    priority: row.priority as string,
    maxPrice: row.max_price as number | null,
    addedAt: row.added_at as string | null,
  }));

  return jsonResponseWithAuthCookies({ docs }, authCookieResponse);
}

type SealedWishlistPostBody = {
  sealedProductId?: number;
  maxPrice?: number | null;
  priority?: "low" | "medium" | "high" | null;
};

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: SealedWishlistPostBody;
  try {
    body = (await request.json()) as SealedWishlistPostBody;
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

  const priority =
    body.priority === "low" || body.priority === "high" || body.priority === "medium"
      ? body.priority
      : "medium";
  const maxPrice =
    typeof body.maxPrice === "number" && Number.isFinite(body.maxPrice) && body.maxPrice >= 0
      ? body.maxPrice
      : null;

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const { data: existing } = await supabase
    .from("customer_sealed_wishlists")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("sealed_product_id", sealedProductId)
    .maybeSingle();

  if (existing?.id) {
    const { data: updated, error } = await supabase
      .from("customer_sealed_wishlists")
      .update({ priority, max_price: maxPrice })
      .eq("id", existing.id)
      .eq("customer_id", customer.id)
      .select()
      .single();

    if (error) {
      return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
    }
    revalidateSealedWishlistSurfaces();
    return jsonResponseWithAuthCookies({ doc: updated, existing: true }, authCookieResponse);
  }

  const { data: created, error } = await supabase
    .from("customer_sealed_wishlists")
    .insert({
      customer_id: customer.id,
      sealed_product_id: sealedProductId,
      priority,
      max_price: maxPrice,
    })
    .select()
    .single();

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  revalidateSealedWishlistSurfaces();
  return jsonResponseWithAuthCookies({ doc: created, existing: false }, authCookieResponse);
}

export async function DELETE(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const sealedProductIdRaw = url.searchParams.get("sealedProductId")?.trim() ?? "";

  const { supabase } = createSupabaseRouteHandlerClient(request);

  if (sealedProductIdRaw) {
    const sealedProductId = Number.parseInt(sealedProductIdRaw, 10);
    if (!Number.isFinite(sealedProductId) || sealedProductId < 1) {
      return jsonResponseWithAuthCookies({ error: "Invalid sealedProductId" }, authCookieResponse, { status: 400 });
    }
    const { error } = await supabase
      .from("customer_sealed_wishlists")
      .delete()
      .eq("customer_id", customer.id)
      .eq("sealed_product_id", sealedProductId);

    if (error) {
      return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
    }
    revalidateSealedWishlistSurfaces();
    return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
  }

  if (!id) {
    return jsonResponseWithAuthCookies(
      { error: "id or sealedProductId query parameter is required" },
      authCookieResponse,
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("customer_sealed_wishlists")
    .delete()
    .eq("id", id)
    .eq("customer_id", customer.id);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  revalidateSealedWishlistSurfaces();
  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
