import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getJsonFromR2 } from "@/lib/adminR2";
import type { CardJsonEntry } from "@/lib/staticDataTypes";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ setCode: string }> },
) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { setCode } = await params;
  const cards = await getJsonFromR2<CardJsonEntry[]>(`data/cards/${setCode}.json`);
  if (!cards) {
    return jsonResponseWithAuthCookies(
      { error: `data/cards/${setCode}.json not found in R2` },
      authCookieResponse,
      { status: 404 },
    );
  }

  return jsonResponseWithAuthCookies(cards, authCookieResponse);
}
