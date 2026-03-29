import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { fetchItemConditionOptions, groupCollectionLinesByMasterCardId } from "@/lib/storefrontCardMaps";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const [itemConditions, collectionEntries, wishlistResult] = await Promise.all([
    fetchItemConditionOptions(),
    fetchCollectionCardEntries(customer.id),
    supabase
      .from("customer_wishlists")
      .select("id, master_card_id, target_printing")
      .eq("customer_id", customer.id)
      .limit(2000),
  ]);

  const wishlistMap: Record<string, { id: string; printing?: string }> = {};
  for (const row of wishlistResult.data ?? []) {
    const mid = row.master_card_id as string;
    const wid = row.id as string;
    if (mid && wid && wishlistMap[mid] === undefined) {
      wishlistMap[mid] = {
        id: wid,
        printing: typeof row.target_printing === "string" ? row.target_printing : undefined,
      };
    }
  }

  const collectionLines = groupCollectionLinesByMasterCardId(collectionEntries);

  return jsonResponseWithAuthCookies({ itemConditions, wishlistMap, collectionLines }, authCookieResponse);
}
