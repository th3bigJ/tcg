import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { buildOnePieceS3Client, getJsonFromOnePieceR2 } from "@/lib/onepieceR2";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const s3 = buildOnePieceS3Client();
  const sets = await getJsonFromOnePieceR2<unknown[]>(s3, "sets/data/sets.json");
  if (!sets) {
    return jsonResponseWithAuthCookies(
      { error: "onepiece/sets/data/sets.json not found in R2" },
      authCookieResponse,
      { status: 404 },
    );
  }

  return jsonResponseWithAuthCookies(sets, authCookieResponse);
}
