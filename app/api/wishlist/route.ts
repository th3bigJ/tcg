import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getItemConditionName } from "@/lib/referenceData";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("customer_wishlists")
    .select("id, master_card_id, target_condition_id, target_printing, max_price, priority, notes, added_at")
    .eq("customer_id", customer.id)
    .order("added_at", { ascending: false })
    .limit(2000);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 500 });
  }

  const docs = (data ?? []).map((row) => ({
    ...row,
    target_condition_name: getItemConditionName(row.target_condition_id as string | null),
  }));

  return jsonResponseWithAuthCookies({ docs }, authCookieResponse);
}

type WishlistPostBody = {
  masterCardId?: string;
  targetConditionId?: string | null;
  targetPrinting?: string | null;
  maxPrice?: number | null;
  priority?: "low" | "medium" | "high" | null;
};

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: WishlistPostBody;
  try {
    body = (await request.json()) as WishlistPostBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const masterCardId = typeof body.masterCardId === "string" ? body.masterCardId.trim() : "";
  if (!masterCardId) {
    return jsonResponseWithAuthCookies({ error: "masterCardId is required" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  // Deduplication check
  const { data: existing } = await supabase
    .from("customer_wishlists")
    .select("id, master_card_id, priority, target_printing")
    .eq("customer_id", customer.id)
    .eq("master_card_id", masterCardId)
    .single();

  if (existing) {
    return jsonResponseWithAuthCookies({ doc: existing, existing: true }, authCookieResponse);
  }

  const priority =
    body.priority === "low" || body.priority === "high" || body.priority === "medium"
      ? body.priority
      : "medium";
  const targetConditionId =
    typeof body.targetConditionId === "string" && body.targetConditionId.trim()
      ? body.targetConditionId.trim()
      : null;
  const targetPrintingRaw = typeof body.targetPrinting === "string" ? body.targetPrinting.trim() : "";
  const targetPrinting =
    targetPrintingRaw && targetPrintingRaw !== "Unlisted"
      ? targetPrintingRaw
      : null;
  const maxPrice =
    typeof body.maxPrice === "number" && Number.isFinite(body.maxPrice) && body.maxPrice >= 0
      ? body.maxPrice
      : null;

  const { data: created, error } = await supabase
    .from("customer_wishlists")
    .insert({
      customer_id: customer.id,
      master_card_id: masterCardId,
      priority,
      target_condition_id: targetConditionId,
      target_printing: targetPrinting,
      max_price: maxPrice,
    })
    .select()
    .single();

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  return jsonResponseWithAuthCookies({ doc: created, existing: false }, authCookieResponse);
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
    .from("customer_wishlists")
    .delete()
    .eq("id", id)
    .eq("customer_id", customer.id);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
