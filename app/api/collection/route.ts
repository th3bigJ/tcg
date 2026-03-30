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
  gradingCompany?: string | null;
  gradeValue?: string | null;
  gradedMarketPrice?: number | null;
  unlistedPrice?: number | null;
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

  const gradingCompany =
    typeof body.gradingCompany === "string" && body.gradingCompany.trim() ? body.gradingCompany.trim() : null;
  const gradeValue =
    typeof body.gradeValue === "string" && body.gradeValue.trim() ? body.gradeValue.trim() : null;
  const gradedMarketPrice =
    typeof body.gradedMarketPrice === "number" && Number.isFinite(body.gradedMarketPrice) && body.gradedMarketPrice >= 0
      ? body.gradedMarketPrice
      : null;
  const unlistedPrice =
    typeof body.unlistedPrice === "number" && Number.isFinite(body.unlistedPrice) && body.unlistedPrice >= 0
      ? body.unlistedPrice
      : null;

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const baseRow: Record<string, unknown> = {
    customer_id: customer.id,
    master_card_id: masterCardId,
    condition_id: conditionId,
    quantity: 1,
    printing,
    language,
    purchase_type: purchaseType,
    price_paid: pricePaid,
    added_at: purchaseDate ?? new Date().toISOString(),
    grading_company: gradingCompany ?? "none",
    grade_value: gradeValue,
  };
  if (gradedMarketPrice !== null) baseRow.graded_market_price = gradedMarketPrice;
  if (unlistedPrice !== null) baseRow.unlisted_price = unlistedPrice;

  const insertRows = Array.from({ length: quantity }, () => ({ ...baseRow }));
  const { data: createdRows, error } = await supabase
    .from("customer_collections")
    .insert(insertRows)
    .select();

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

  const docs = createdRows ?? [];
  const doc = docs[0] ?? null;
  return jsonResponseWithAuthCookies({ doc, docs }, authCookieResponse);
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
  conditionId?: string | null;
  printing?: string | null;
  purchaseDate?: string | null;
  gradingCompany?: string | null;
  gradeValue?: string | null;
  gradedMarketPrice?: number | null;
  unlistedPrice?: number | null;
  gradedImage?: string | null;
  gradedSerial?: string | null;
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

  const updates: Record<string, unknown> = {};

  if (typeof body.quantity === "number") {
    const quantity = Number.isFinite(body.quantity) ? Math.floor(body.quantity) : NaN;
    if (!Number.isFinite(quantity) || quantity < 1) {
      return jsonResponseWithAuthCookies(
        { error: "quantity must be a whole number ≥ 1" },
        authCookieResponse,
        { status: 400 },
      );
    }
    updates.quantity = quantity;
  }

  if ("conditionId" in body) updates.condition_id = body.conditionId?.trim() || null;
  if ("printing" in body) updates.printing = body.printing?.trim() || null;
  if ("purchaseDate" in body) {
    const raw = body.purchaseDate?.trim();
    updates.added_at = raw ? new Date(raw).toISOString() : null;
  }
  if ("gradingCompany" in body) updates.grading_company = body.gradingCompany?.trim() || "none";
  if ("gradeValue" in body) updates.grade_value = body.gradeValue?.trim() || null;
  if ("gradedMarketPrice" in body) {
    updates.graded_market_price =
      typeof body.gradedMarketPrice === "number" && Number.isFinite(body.gradedMarketPrice) && body.gradedMarketPrice >= 0
        ? body.gradedMarketPrice
        : null;
  }
  if ("unlistedPrice" in body) {
    updates.unlisted_price =
      typeof body.unlistedPrice === "number" && Number.isFinite(body.unlistedPrice) && body.unlistedPrice >= 0
        ? body.unlistedPrice
        : null;
  }
  if ("gradedImage" in body) updates.graded_image = body.gradedImage?.trim() || null;
  if ("gradedSerial" in body) updates.graded_serial = body.gradedSerial?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return jsonResponseWithAuthCookies({ error: "No fields to update" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const { data: updated, error } = await supabase
    .from("customer_collections")
    .update(updates)
    .eq("id", idRaw)
    .eq("customer_id", customer.id)
    .select()
    .single();

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  return jsonResponseWithAuthCookies({ doc: updated }, authCookieResponse);
}
