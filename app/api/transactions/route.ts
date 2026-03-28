import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getProductTypeById, getProductTypeBySlug } from "@/lib/referenceData";

type TransactionPostBody = {
  direction?: string;
  productTypeId?: string;
  productTypeSlug?: string;
  description?: string;
  masterCardId?: string | null;
  quantity?: number;
  unitPrice?: number;
  transactionDate?: string;
  notes?: string | null;
};

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("account_transactions")
    .select("id, direction, description, master_card_id, quantity, unit_price, transaction_date, notes, created_at, product_type_id")
    .eq("customer_id", customer.id)
    .order("transaction_date", { ascending: false })
    .limit(2000);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 500 });
  }

  const docs = (data ?? []).map((row) => ({
    id: row.id,
    direction: row.direction,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    transactionDate: row.transaction_date,
    notes: row.notes,
    masterCardId: row.master_card_id,
    productType: row.product_type_id ? (getProductTypeById(row.product_type_id as string) ?? null) : null,
  }));

  return jsonResponseWithAuthCookies({ docs }, authCookieResponse);
}

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: TransactionPostBody;
  try {
    body = (await request.json()) as TransactionPostBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const direction = body.direction === "purchase" || body.direction === "sale" ? body.direction : null;
  if (!direction) {
    return jsonResponseWithAuthCookies({ error: "direction must be 'purchase' or 'sale'" }, authCookieResponse, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return jsonResponseWithAuthCookies({ error: "description is required" }, authCookieResponse, { status: 400 });
  }

  const quantity =
    typeof body.quantity === "number" && Number.isFinite(body.quantity) && body.quantity >= 1
      ? Math.floor(body.quantity)
      : 1;
  const unitPrice =
    typeof body.unitPrice === "number" && Number.isFinite(body.unitPrice) && body.unitPrice >= 0
      ? body.unitPrice
      : 0;
  const transactionDate =
    typeof body.transactionDate === "string" && body.transactionDate.trim()
      ? new Date(body.transactionDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  const masterCardId =
    typeof body.masterCardId === "string" && body.masterCardId.trim() ? body.masterCardId.trim() : null;

  const { supabase } = createSupabaseRouteHandlerClient(request);

  // Resolve product type — accept either an id or a slug
  let productTypeId: string | null = null;
  if (typeof body.productTypeId === "string" && body.productTypeId.trim()) {
    const pt = getProductTypeById(body.productTypeId.trim());
    productTypeId = pt?.id ?? null;
  } else if (typeof body.productTypeSlug === "string" && body.productTypeSlug.trim()) {
    const pt = getProductTypeBySlug(body.productTypeSlug.trim());
    productTypeId = pt?.id ?? null;
  }

  if (!productTypeId) {
    return jsonResponseWithAuthCookies(
      { error: "productTypeId or productTypeSlug is required and must resolve to a valid product type" },
      authCookieResponse,
      { status: 400 },
    );
  }

  const { data: created, error } = await supabase
    .from("account_transactions")
    .insert({
      customer_id: customer.id,
      direction,
      product_type_id: productTypeId,
      description,
      master_card_id: masterCardId,
      quantity,
      unit_price: unitPrice,
      transaction_date: transactionDate,
      notes,
    })
    .select()
    .single();

  if (error || !created) {
    return jsonResponseWithAuthCookies({ error: error?.message ?? "Insert failed" }, authCookieResponse, { status: 422 });
  }

  const doc = {
    id: created.id,
    direction: created.direction,
    description: created.description,
    quantity: created.quantity,
    unitPrice: created.unit_price,
    transactionDate: created.transaction_date,
    notes: created.notes,
    masterCardId: created.master_card_id,
    productType: created.product_type_id ? (getProductTypeById(created.product_type_id as string) ?? null) : null,
  };

  return jsonResponseWithAuthCookies({ doc }, authCookieResponse);
}
