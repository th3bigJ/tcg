import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { getRelationshipDocumentId, toPayloadRelationshipId } from "@/lib/relationshipId";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, {
      status: 401,
    });
  }

  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customer.id) ?? customer.id;
  const result = await payload.find({
    collection: "customer-wishlists",
    where: { customer: { equals: customerRelId } },
    depth: 2,
    limit: 2000,
    sort: "-addedAt",
    overrideAccess: true,
  });

  return jsonResponseWithAuthCookies({ docs: result.docs }, authCookieResponse);
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
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, {
      status: 401,
    });
  }

  let body: WishlistPostBody;
  try {
    body = (await request.json()) as WishlistPostBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, {
      status: 400,
    });
  }

  const masterCardId = typeof body.masterCardId === "string" ? body.masterCardId.trim() : "";
  if (!masterCardId) {
    return jsonResponseWithAuthCookies({ error: "masterCardId is required" }, authCookieResponse, {
      status: 400,
    });
  }

  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customer.id);
  const masterRelId = toPayloadRelationshipId(masterCardId);
  if (customerRelId === undefined || masterRelId === undefined) {
    return jsonResponseWithAuthCookies(
      { error: "Invalid customer or card id" },
      authCookieResponse,
      { status: 400 },
    );
  }

  const existing = await payload.find({
    collection: "customer-wishlists",
    where: {
      and: [
        { customer: { equals: customerRelId } },
        { masterCard: { equals: masterRelId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (existing.docs[0]) {
    return jsonResponseWithAuthCookies(
      { doc: existing.docs[0], existing: true },
      authCookieResponse,
    );
  }

  const data: Record<string, unknown> = {
    customer: customerRelId,
    masterCard: masterRelId,
    priority:
      body.priority === "low" || body.priority === "high" || body.priority === "medium"
        ? body.priority
        : "medium",
  };

  const tpid =
    typeof body.targetConditionId === "string" && body.targetConditionId.trim()
      ? body.targetConditionId.trim()
      : undefined;
  if (tpid) {
    const condRel = toPayloadRelationshipId(tpid);
    if (condRel !== undefined) data.targetCondition = condRel;
  }

  const tp =
    typeof body.targetPrinting === "string" && body.targetPrinting.trim()
      ? body.targetPrinting.trim()
      : undefined;
  if (tp) data.targetPrinting = tp;

  if (
    typeof body.maxPrice === "number" &&
    Number.isFinite(body.maxPrice) &&
    body.maxPrice >= 0
  ) {
    data.maxPrice = body.maxPrice;
  }

  try {
    const created = await payload.create({
      collection: "customer-wishlists",
      data: data as never,
      overrideAccess: true,
    });
    return jsonResponseWithAuthCookies({ doc: created, existing: false }, authCookieResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return jsonResponseWithAuthCookies({ error: message }, authCookieResponse, { status: 422 });
  }
}

export async function DELETE(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, {
      status: 401,
    });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return jsonResponseWithAuthCookies(
      { error: "id query parameter is required" },
      authCookieResponse,
      { status: 400 },
    );
  }

  const payload = await getPayload({ config });
  const customerRelIdDel = toPayloadRelationshipId(customer.id) ?? customer.id;
  const entryRelId = toPayloadRelationshipId(id) ?? id;

  const found = await payload.find({
    collection: "customer-wishlists",
    where: {
      and: [{ id: { equals: entryRelId } }, { customer: { equals: customerRelIdDel } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const doc = found.docs[0];
  if (!doc) {
    return jsonResponseWithAuthCookies({ error: "Not found" }, authCookieResponse, { status: 404 });
  }

  await payload.delete({
    collection: "customer-wishlists",
    id: getRelationshipDocumentId(doc.id) ?? id,
    overrideAccess: true,
  });

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
