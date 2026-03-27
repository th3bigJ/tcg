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
    collection: "customer-collections",
    where: { customer: { equals: customerRelId } },
    depth: 2,
    limit: 2000,
    sort: "-addedAt",
    overrideAccess: true,
    select: {
      masterCard: true,
      condition: true,
      quantity: true,
      printing: true,
      language: true,
    },
  });

  return jsonResponseWithAuthCookies({ docs: result.docs }, authCookieResponse);
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
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, {
      status: 401,
    });
  }

  let body: CollectionPostBody;
  try {
    body = (await request.json()) as CollectionPostBody;
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

  const quantity =
    typeof body.quantity === "number" && Number.isFinite(body.quantity) && body.quantity >= 1
      ? Math.floor(body.quantity)
      : 1;

  const printing = typeof body.printing === "string" ? body.printing : "Standard";
  const language = typeof body.language === "string" ? body.language : "English";
  const conditionId =
    typeof body.conditionId === "string" && body.conditionId.trim() ? body.conditionId.trim() : undefined;
  const purchaseType =
    body.purchaseType === "packed" || body.purchaseType === "bought" ? body.purchaseType : undefined;
  const pricePaid =
    purchaseType === "bought" && typeof body.pricePaid === "number" && Number.isFinite(body.pricePaid) && body.pricePaid >= 0
      ? body.pricePaid
      : undefined;
  const purchaseDate =
    purchaseType === "bought" && typeof body.purchaseDate === "string" && body.purchaseDate.trim()
      ? new Date(body.purchaseDate).toISOString()
      : undefined;

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

  const data: Record<string, unknown> = {
    customer: customerRelId,
    masterCard: masterRelId,
    quantity,
    printing,
    language,
  };
  const conditionRelId = conditionId ? toPayloadRelationshipId(conditionId) : undefined;
  if (conditionRelId !== undefined) data.condition = conditionRelId;
  if (purchaseType !== undefined) data.purchaseType = purchaseType;
  if (pricePaid !== undefined) data.pricePaid = pricePaid;

  try {
    const created = await payload.create({
      collection: "customer-collections",
      data: data as never,
      overrideAccess: true,
    });

    // Auto-create a purchase transaction when a card is bought with a price
    if (purchaseType === "bought" && pricePaid !== undefined) {
      try {
        // Find the single-card product type by slug
        const ptResult = await payload.find({
          collection: "product-types",
          where: { slug: { equals: "single-card" } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        });
        const ptDoc = ptResult.docs[0];

        if (ptDoc) {
          // Fetch the card name
          const cardDoc = await payload.findByID({
            collection: "master-card-list",
            id: masterRelId as number,
            depth: 0,
            overrideAccess: true,
            select: { cardName: true },
          });
          const cardName =
            typeof (cardDoc as { cardName?: unknown }).cardName === "string"
              ? (cardDoc as { cardName: string }).cardName
              : "Unknown card";

          const ptRelId = toPayloadRelationshipId(getRelationshipDocumentId(ptDoc.id) ?? "");
          if (ptRelId !== undefined) {
            await payload.create({
              collection: "account-transactions",
              data: {
                customer: customerRelId,
                direction: "purchase",
                productType: ptRelId,
                description: cardName,
                masterCard: masterRelId,
                quantity,
                unitPrice: pricePaid,
                transactionDate: purchaseDate ?? new Date().toISOString(),
              } as never,
              overrideAccess: true,
            });
          }
        }
      } catch {
        // Transaction creation is best-effort — don't fail the collection add
      }
    }

    return jsonResponseWithAuthCookies({ doc: created }, authCookieResponse);
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
  const customerRelId = toPayloadRelationshipId(customer.id) ?? customer.id;
  const entryRelId = toPayloadRelationshipId(id) ?? id;

  const found = await payload.find({
    collection: "customer-collections",
    where: {
      and: [{ id: { equals: entryRelId } }, { customer: { equals: customerRelId } }],
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
    collection: "customer-collections",
    id: getRelationshipDocumentId(doc.id) ?? id,
    overrideAccess: true,
  });

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}

type CollectionPatchBody = {
  id?: string;
  quantity?: number;
};

export async function PATCH(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, {
      status: 401,
    });
  }

  let body: CollectionPatchBody;
  try {
    body = (await request.json()) as CollectionPatchBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, {
      status: 400,
    });
  }

  const idRaw = typeof body.id === "string" ? body.id.trim() : "";
  if (!idRaw) {
    return jsonResponseWithAuthCookies({ error: "id is required" }, authCookieResponse, {
      status: 400,
    });
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

  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customer.id) ?? customer.id;
  const entryRelId = toPayloadRelationshipId(idRaw) ?? idRaw;

  const found = await payload.find({
    collection: "customer-collections",
    where: {
      and: [{ id: { equals: entryRelId } }, { customer: { equals: customerRelId } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const doc = found.docs[0];
  if (!doc) {
    return jsonResponseWithAuthCookies({ error: "Not found" }, authCookieResponse, { status: 404 });
  }

  const docId = getRelationshipDocumentId(doc.id) ?? idRaw;
  const updated = await payload.update({
    collection: "customer-collections",
    id: docId,
    data: { quantity },
    overrideAccess: true,
  });

  return jsonResponseWithAuthCookies({ doc: updated }, authCookieResponse);
}
