import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getJsonFromR2 } from "@/lib/adminR2";
import type { SetJsonEntry } from "@/lib/staticDataTypes";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const sets = await getJsonFromR2<SetJsonEntry[]>("data/sets.json");
  if (!sets) {
    return jsonResponseWithAuthCookies({ error: "sets.json not found in R2" }, authCookieResponse, { status: 404 });
  }

  return jsonResponseWithAuthCookies(sets, authCookieResponse);
}
