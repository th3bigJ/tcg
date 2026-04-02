import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { estimateCollectionMarketValueGbp } from "@/lib/collectionMarketValueGbp";
import { getItemConditionName } from "@/lib/referenceData";
import { mapCustomerCollectionRow, type StorefrontCardEntry } from "@/lib/storefrontCardMaps";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data } = await supabase
    .from("customer_collections")
    .select(
      "id, master_card_id, quantity, printing, language, added_at, condition_id, purchase_type, price_paid, unlisted_price, grading_company, grade_value, graded_image, graded_serial",
    )
    .eq("customer_id", customer.id)
    .limit(2000);

  const entries: StorefrontCardEntry[] = (data ?? [])
    .map((row) => {
      const conditionName = getItemConditionName(row.condition_id as string | null);
      return mapCustomerCollectionRow(row as unknown as Record<string, unknown>, conditionName);
    })
    .filter((entry): entry is StorefrontCardEntry => Boolean(entry));

  if (entries.length === 0) {
    return jsonResponseWithAuthCookies({ totalValue: 0, cardCount: 0 }, authCookieResponse);
  }

  const collectionValue = await estimateCollectionMarketValueGbp(entries);
  const cardCount = entries.reduce((sum, entry) => {
    const quantity =
      typeof entry.quantity === "number" && Number.isFinite(entry.quantity) && entry.quantity >= 1
        ? Math.floor(entry.quantity)
        : 1;
    return sum + quantity;
  }, 0);

  return jsonResponseWithAuthCookies(
    { totalValue: collectionValue.totalGbp, cardCount },
    authCookieResponse,
  );
}
