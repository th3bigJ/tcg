import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { acceptProfileShare } from "@/lib/customerProfileSharesServer";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

type RouteParams = { params: Promise<{ shareId: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { shareId } = await params;
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(_request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const result = await acceptProfileShare(shareId, customer.id);
  if (!result.ok) {
    return jsonResponseWithAuthCookies({ error: result.error }, authCookieResponse, { status: 400 });
  }

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
