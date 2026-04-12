import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { buildOnePieceS3Client, getJsonFromOnePieceR2 } from "@/lib/onepieceR2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ setCode: string }> },
) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { setCode } = await params;
  const s3 = buildOnePieceS3Client();
  const cards = await getJsonFromOnePieceR2<unknown[]>(s3, `cards/data/${setCode}.json`);
  if (!cards) {
    return jsonResponseWithAuthCookies(
      { error: `onepiece/cards/data/${setCode}.json not found in R2` },
      authCookieResponse,
      { status: 404 },
    );
  }

  return jsonResponseWithAuthCookies(cards, authCookieResponse);
}
