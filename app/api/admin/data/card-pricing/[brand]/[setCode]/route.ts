import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getJsonFromR2 } from "@/lib/adminR2";
import { buildLorcanaS3Client, getJsonFromLorcanaR2 } from "@/lib/lorcanaR2";
import { buildOnePieceS3Client, getJsonFromOnePieceR2 } from "@/lib/onepieceR2";
import { r2SinglesCardPricingPrefix, r2SinglesPriceHistoryPrefix, r2SinglesPriceTrendsPrefix } from "@/lib/r2BucketLayout";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brand: string; setCode: string }> },
) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { brand, setCode } = await params;

  if (brand === "pokemon") {
    const [pricing, history, trends] = await Promise.all([
      getJsonFromR2(`${r2SinglesCardPricingPrefix}/${setCode}.json`),
      getJsonFromR2(`${r2SinglesPriceHistoryPrefix}/${setCode}.json`),
      getJsonFromR2(`${r2SinglesPriceTrendsPrefix}/${setCode}.json`),
    ]);
    return jsonResponseWithAuthCookies({ pricing, history, trends }, authCookieResponse);
  }

  if (brand === "onepiece") {
    const s3 = buildOnePieceS3Client();
    const [pricing, history, trends] = await Promise.all([
      getJsonFromOnePieceR2(s3, `pricing/market/${setCode}.json`),
      getJsonFromOnePieceR2(s3, `pricing/history/${setCode}.json`),
      getJsonFromOnePieceR2(s3, `pricing/trends/${setCode}.json`),
    ]);
    return jsonResponseWithAuthCookies({ pricing, history, trends }, authCookieResponse);
  }

  if (brand === "lorcana") {
    const s3 = buildLorcanaS3Client();
    const [pricing, history, trends] = await Promise.all([
      getJsonFromLorcanaR2(s3, `pricing/market/${setCode}.json`),
      getJsonFromLorcanaR2(s3, `pricing/history/${setCode}.json`),
      getJsonFromLorcanaR2(s3, `pricing/trends/${setCode}.json`),
    ]);
    return jsonResponseWithAuthCookies({ pricing, history, trends }, authCookieResponse);
  }

  return jsonResponseWithAuthCookies({ error: "Unknown brand" }, authCookieResponse, { status: 400 });
}
