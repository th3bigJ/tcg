import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { getRelationshipDocumentId, toPayloadRelationshipId, toPayloadDocumentId } from "@/lib/relationshipId";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

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
};

async function resolveAndCheckOwnership(
  payload: Awaited<ReturnType<typeof getPayload>>,
  id: string,
  customerRelId: string | number,
) {
  const found = await payload.find({
    collection: "account-transactions",
    where: {
      and: [
        { id: { equals: toPayloadRelationshipId(id) } },
        { customer: { equals: customerRelId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return found.docs[0] ?? null;
}

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

  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customer.id) ?? customer.id;

  const doc = await resolveAndCheckOwnership(payload, rawId, customerRelId);
  if (!doc) {
    return jsonResponseWithAuthCookies({ error: "Not found" }, authCookieResponse, { status: 404 });
  }

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
    updates.unitPrice = body.unitPrice;
  }
  if (typeof body.transactionDate === "string" && body.transactionDate.trim()) {
    updates.transactionDate = new Date(body.transactionDate).toISOString();
  }
  if (body.notes !== undefined) {
    updates.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  }
  if (body.masterCardId !== undefined) {
    updates.masterCard = body.masterCardId ? toPayloadRelationshipId(body.masterCardId) : null;
  }

  // Resolve product type update
  if (body.productTypeId) {
    const ptRelId = toPayloadRelationshipId(body.productTypeId);
    if (ptRelId !== undefined) updates.productType = ptRelId;
  } else if (body.productTypeSlug) {
    const ptResult = await payload.find({
      collection: "product-types",
      where: { slug: { equals: body.productTypeSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const ptDoc = ptResult.docs[0];
    if (ptDoc) {
      const rawPtId = getRelationshipDocumentId(ptDoc.id);
      if (rawPtId) updates.productType = toPayloadRelationshipId(rawPtId);
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponseWithAuthCookies({ error: "No valid fields to update" }, authCookieResponse, { status: 400 });
  }

  try {
    const docId = toPayloadDocumentId(doc.id);
    const updated = await payload.update({
      collection: "account-transactions",
      id: docId,
      data: updates as never,
      overrideAccess: true,
    });
    return jsonResponseWithAuthCookies({ doc: updated }, authCookieResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return jsonResponseWithAuthCookies({ error: message }, authCookieResponse, { status: 422 });
  }
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

  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customer.id) ?? customer.id;

  const doc = await resolveAndCheckOwnership(payload, rawId, customerRelId);
  if (!doc) {
    return jsonResponseWithAuthCookies({ error: "Not found" }, authCookieResponse, { status: 404 });
  }

  try {
    const docId = toPayloadDocumentId(doc.id);
    await payload.delete({
      collection: "account-transactions",
      id: docId,
      overrideAccess: true,
    });
    return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return jsonResponseWithAuthCookies({ error: message }, authCookieResponse, { status: 422 });
  }
}
