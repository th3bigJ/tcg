import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getCardMapById } from "@/lib/staticCardIndex";
import { getItemConditionName, getProductTypeBySlug } from "@/lib/referenceData";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("customer_collections")
    .select("id, master_card_id, condition_id, quantity, printing, language, added_at")
    .eq("customer_id", customer.id)
    .order("added_at", { ascending: false })
    .limit(2000);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 500 });
  }

  const docs = (data ?? []).map((row) => ({
    ...row,
    condition_name: getItemConditionName(row.condition_id as string | null),
  }));

  return jsonResponseWithAuthCookies({ docs }, authCookieResponse);
}

type CollectionPostBody = {
  masterCardId?: string;
  conditionId?: string | null;
  quantity?: number;
  printing?: string;
  language?: string;
  purchaseType?: string;
  pricePaid?: number | null;
  purchaseDate?: string | null;
};

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: CollectionPostBody;
  try {
    body = (await request.json()) as CollectionPostBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const masterCardId = typeof body.masterCardId === "string" ? body.masterCardId.trim() : "";
  if (!masterCardId) {
    return jsonResponseWithAuthCookies({ error: "masterCardId is required" }, authCookieResponse, { status: 400 });
  }

  const quantity =
    typeof body.quantity === "number" && Number.isFinite(body.quantity) && body.quantity >= 1
      ? Math.floor(body.quantity)
      : 1;
  const printing = typeof body.printing === "string" ? body.printing : "Standard";
  const language = typeof body.language === "string" ? body.language : "English";
  const conditionId =
    typeof body.conditionId === "string" && body.conditionId.trim() ? body.conditionId.trim() : null;
  const purchaseType =
    body.purchaseType === "packed" || body.purchaseType === "bought" ? body.purchaseType : null;
  const pricePaid =
    purchaseType === "bought" && typeof body.pricePaid === "number" && Number.isFinite(body.pricePaid) && body.pricePaid >= 0
      ? body.pricePaid
      : null;
  const purchaseDate =
    purchaseType === "bought" && typeof body.purchaseDate === "string" && body.purchaseDate.trim()
      ? new Date(body.purchaseDate).toISOString()
      : null;

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const { data: created, error } = await supabase
    .from("customer_collections")
    .insert({
      customer_id: customer.id,
      master_card_id: masterCardId,
      condition_id: conditionId,
      quantity,
      printing,
      language,
      purchase_type: purchaseType,
      price_paid: pricePaid,
      added_at: purchaseDate ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  // Auto-create a purchase transaction when a card is bought with a price
  if (purchaseType === "bought" && pricePaid !== null) {
    try {
      const pt = getProductTypeBySlug("single-card");
      if (pt) {
        const cardName = getCardMapById().get(masterCardId)?.cardName ?? "Unknown card";
        await supabase.from("account_transactions").insert({
          customer_id: customer.id,
          direction: "purchase",
          product_type_id: pt.id,
          description: cardName,
          master_card_id: masterCardId,
          quantity,
          unit_price: pricePaid,
          transaction_date: purchaseDate ? purchaseDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
        });
      }
    } catch {
      // Transaction creation is best-effort — don't fail the collection add
    }
  }

  return jsonResponseWithAuthCookies({ doc: created }, authCookieResponse);
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

  // Verify ownership then delete
  const { error } = await supabase
    .from("customer_collections")
    .delete()
    .eq("id", id)
    .eq("customer_id", customer.id);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}

type CollectionPatchBody = {
  id?: string;
  quantity?: number;
};

export async function PATCH(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: CollectionPatchBody;
  try {
    body = (await request.json()) as CollectionPatchBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const idRaw = typeof body.id === "string" ? body.id.trim() : "";
  if (!idRaw) {
    return jsonResponseWithAuthCookies({ error: "id is required" }, authCookieResponse, { status: 400 });
  }

  const quantity =
    typeof body.quantity === "number" && Number.isFinite(body.quantity) ? Math.floor(body.quantity) : NaN;
  if (!Number.isFinite(quantity) || quantity < 1) {
    return jsonResponseWithAuthCookies(
      { error: "quantity must be a whole number ≥ 1 (use DELETE to remove a row)" },
      authCookieResponse,
      { status: 400 },
    );
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const { data: updated, error } = await supabase
    .from("customer_collections")
    .update({ quantity })
    .eq("id", idRaw)
    .eq("customer_id", customer.id)
    .select()
    .single();

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  return jsonResponseWithAuthCookies({ doc: updated }, authCookieResponse);
}
