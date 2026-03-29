import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { countUnreadTradeNotifications, listUnreadTradeNotifications } from "@/lib/tradeNotificationsServer";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const countOnly = new URL(request.url).searchParams.get("countOnly") === "1";

  if (countOnly) {
    const count = await countUnreadTradeNotifications(supabase);
    return jsonResponseWithAuthCookies({ count }, authCookieResponse);
  }

  const notifications = await listUnreadTradeNotifications(supabase);
  return jsonResponseWithAuthCookies({ notifications }, authCookieResponse);
}
