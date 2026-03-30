import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { fetchItemConditionOptions, groupCollectionLinesByMasterCardId } from "@/lib/storefrontCardMaps";
import { fetchCollectionCardEntries, fetchWishlistIdsByMasterCard } from "@/lib/storefrontCardMapsServer";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const [itemConditions, collectionEntries, wishlistMap] = await Promise.all([
    fetchItemConditionOptions(),
    fetchCollectionCardEntries(customer.id),
    fetchWishlistIdsByMasterCard(customer.id),
  ]);

  const collectionLines = groupCollectionLinesByMasterCardId(collectionEntries);

  return jsonResponseWithAuthCookies({ itemConditions, wishlistMap, collectionLines }, authCookieResponse);
}
