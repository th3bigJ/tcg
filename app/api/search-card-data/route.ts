import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { getRelationshipDocumentId, toPayloadRelationshipId } from "@/lib/relationshipId";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import {
  fetchCollectionCardEntries,
  fetchItemConditionOptions,
  groupCollectionLinesByMasterCardId,
} from "@/lib/storefrontCardMaps";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, {
      status: 401,
    });
  }

  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customer.id) ?? customer.id;

  const [itemConditions, collectionEntries, wishlistResult] = await Promise.all([
    fetchItemConditionOptions(),
    fetchCollectionCardEntries(customer.id),
    payload.find({
      collection: "customer-wishlists",
      where: { customer: { equals: customerRelId } },
      depth: 0,
      limit: 2000,
      overrideAccess: true,
      select: { masterCard: true },
    }),
  ]);

  const wishlistMap: Record<string, string> = {};
  for (const doc of wishlistResult.docs) {
    const wid = getRelationshipDocumentId((doc as { id?: unknown }).id);
    const mid = getRelationshipDocumentId((doc as { masterCard?: unknown }).masterCard);
    if (wid && mid && wishlistMap[mid] === undefined) wishlistMap[mid] = wid;
  }

  const collectionLines = groupCollectionLinesByMasterCardId(collectionEntries);

  return jsonResponseWithAuthCookies(
    { itemConditions, wishlistMap, collectionLines },
    authCookieResponse,
  );
}
