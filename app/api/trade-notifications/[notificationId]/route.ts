import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { markTradeNotificationRead } from "@/lib/tradeNotificationsServer";

type RouteParams = { params: Promise<{ notificationId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { notificationId } = await params;
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const id = notificationId.trim();
  if (!id) {
    return jsonResponseWithAuthCookies({ error: "Invalid id" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const result = await markTradeNotificationRead(supabase, id);
  if (!result.ok) {
    return jsonResponseWithAuthCookies({ error: result.error }, authCookieResponse, { status: 422 });
  }

  return jsonResponseWithAuthCookies({ ok: true as const }, authCookieResponse);
}
