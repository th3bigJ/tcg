import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { getRelationshipDocumentId, toPayloadRelationshipId, toPayloadDocumentId } from "@/lib/relationshipId";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

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

  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customer.id) ?? customer.id;

  const result = await payload.find({
    collection: "account-transactions",
    where: { customer: { equals: customerRelId } },
    sort: "-transactionDate",
    depth: 1,
    limit: 2000,
    overrideAccess: true,
  });

  return jsonResponseWithAuthCookies({ docs: result.docs }, authCookieResponse);
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
      ? new Date(body.transactionDate).toISOString()
      : new Date().toISOString();

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : undefined;

  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customer.id);
  if (customerRelId === undefined) {
    return jsonResponseWithAuthCookies({ error: "Invalid customer id" }, authCookieResponse, { status: 400 });
  }

  // Resolve product type — accept either an id or a slug
  let productTypeRelId: string | number | undefined;
  if (body.productTypeId) {
    productTypeRelId = toPayloadRelationshipId(body.productTypeId);
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
      const rawId = getRelationshipDocumentId(ptDoc.id);
      if (rawId) productTypeRelId = toPayloadRelationshipId(rawId);
    }
  }

  if (!productTypeRelId) {
    return jsonResponseWithAuthCookies(
      { error: "productTypeId or productTypeSlug is required and must resolve to a valid product type" },
      authCookieResponse,
      { status: 400 },
    );
  }

  const masterCardRelId =
    body.masterCardId ? toPayloadRelationshipId(body.masterCardId) : undefined;

  const data: Record<string, unknown> = {
    customer: customerRelId,
    direction,
    productType: productTypeRelId,
    description,
    quantity,
    unitPrice,
    transactionDate,
  };
  if (notes !== undefined) data.notes = notes;
  if (masterCardRelId !== undefined) data.masterCard = masterCardRelId;

  try {
    const created = await payload.create({
      collection: "account-transactions",
      data: data as never,
      overrideAccess: true,
    });
    return jsonResponseWithAuthCookies({ doc: created }, authCookieResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return jsonResponseWithAuthCookies({ error: message }, authCookieResponse, { status: 422 });
  }
}
