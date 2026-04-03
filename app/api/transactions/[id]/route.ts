import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import {
  getProductTypeById,
  getProductTypeBySlug,
  normalizeSealedStateForProductType,
} from "@/lib/referenceData";

type TransactionPatchBody = {
  direction?: string;
  productTypeId?: string;
  productTypeSlug?: string;
  description?: string;
  masterCardId?: string | null;
  quantity?: number;
  unitPrice?: number;
  transactionDate?: string;
  notes?: string | null;
  sealedState?: "sealed" | "opened" | null;
  sourceReference?: string | null;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { id: rawId } = await params;
  if (!rawId?.trim()) {
    return jsonResponseWithAuthCookies({ error: "id is required" }, authCookieResponse, { status: 400 });
  }

  let body: TransactionPatchBody;
  try {
    body = (await request.json()) as TransactionPatchBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const updates: Record<string, unknown> = {};

  if (body.direction === "purchase" || body.direction === "sale") {
    updates.direction = body.direction;
  }
  if (typeof body.description === "string" && body.description.trim()) {
    updates.description = body.description.trim();
  }
  if (typeof body.quantity === "number" && Number.isFinite(body.quantity) && body.quantity >= 1) {
    updates.quantity = Math.floor(body.quantity);
  }
  if (typeof body.unitPrice === "number" && Number.isFinite(body.unitPrice) && body.unitPrice >= 0) {
    updates.unit_price = body.unitPrice;
  }
  if (typeof body.transactionDate === "string" && body.transactionDate.trim()) {
    updates.transaction_date = new Date(body.transactionDate).toISOString().slice(0, 10);
  }
  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if (body.masterCardId !== undefined) {
    updates.master_card_id =
      typeof body.masterCardId === "string" && body.masterCardId.trim()
        ? body.masterCardId.trim()
        : null;
  }
  if (body.sourceReference !== undefined) {
    updates.source_reference =
      typeof body.sourceReference === "string" && body.sourceReference.trim()
        ? body.sourceReference.trim()
        : null;
  }

  // Resolve product type update
  let resolvedProductTypeId: string | null = null;
  if (
    body.productTypeId === null ||
    body.productTypeId === "" ||
    body.productTypeSlug === null ||
    body.productTypeSlug === ""
  ) {
    if (
      body.productTypeId !== undefined ||
      body.productTypeSlug !== undefined
    ) {
      updates.product_type_id = null;
      resolvedProductTypeId = null;
    }
  } else if (typeof body.productTypeId === "string" && body.productTypeId.trim()) {
    const pt = getProductTypeById(body.productTypeId.trim());
    if (pt) {
      updates.product_type_id = pt.id;
      resolvedProductTypeId = pt.id;
    }
  } else if (typeof body.productTypeSlug === "string" && body.productTypeSlug.trim()) {
    const pt = getProductTypeBySlug(body.productTypeSlug.trim());
    if (pt) {
      updates.product_type_id = pt.id;
      resolvedProductTypeId = pt.id;
    }
  }

  if (body.sealedState !== undefined) {
    const slugForSeal =
      resolvedProductTypeId !== null
        ? (getProductTypeById(resolvedProductTypeId)?.slug ?? resolvedProductTypeId)
        : null;
    if (slugForSeal) {
      updates.sealed_state = normalizeSealedStateForProductType(slugForSeal, body.sealedState);
    } else {
      const { data: existingRow } = await supabase
        .from("account_transactions")
        .select("product_type_id")
        .eq("id", rawId)
        .eq("customer_id", customer.id)
        .maybeSingle();
      const existingPtId = existingRow?.product_type_id as string | undefined;
      const slug =
        existingPtId !== undefined
          ? (getProductTypeById(String(existingPtId))?.slug ?? String(existingPtId))
          : "";
      if (slug) {
        updates.sealed_state = normalizeSealedStateForProductType(slug, body.sealedState);
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponseWithAuthCookies({ error: "No valid fields to update" }, authCookieResponse, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("account_transactions")
    .update(updates)
    .eq("id", rawId)
    .eq("customer_id", customer.id)
    .select()
    .single();

  if (error || !updated) {
    return jsonResponseWithAuthCookies({ error: error?.message ?? "Not found" }, authCookieResponse, { status: error ? 422 : 404 });
  }

  const doc = {
    id: updated.id,
    direction: updated.direction,
    description: updated.description,
    quantity: updated.quantity,
    unitPrice: updated.unit_price,
    transactionDate: updated.transaction_date,
    notes: updated.notes,
    masterCardId: updated.master_card_id,
    sealedState: (updated.sealed_state as "sealed" | "opened" | null | undefined) ?? null,
    sourceReference: (updated.source_reference as string | null | undefined) ?? null,
    productType: updated.product_type_id ? (getProductTypeById(updated.product_type_id as string) ?? null) : null,
  };

  return jsonResponseWithAuthCookies({ doc }, authCookieResponse);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { id: rawId } = await params;
  if (!rawId?.trim()) {
    return jsonResponseWithAuthCookies({ error: "id is required" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { error } = await supabase
    .from("account_transactions")
    .delete()
    .eq("id", rawId)
    .eq("customer_id", customer.id);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
