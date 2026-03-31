import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { getSearchCardDataForCustomer } from "@/lib/searchCardDataServer";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const payload = await getSearchCardDataForCustomer(customer.id);
  return jsonResponseWithAuthCookies(payload, authCookieResponse);
}
