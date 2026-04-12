import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { buildOnePieceS3Client, getJsonFromOnePieceR2, putJsonToOnePieceR2 } from "@/lib/onepieceR2";

type OnePieceCardEntry = { priceKey: string; setCode: string; [key: string]: unknown };

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const body = await request.json() as { setCode: string; updatedEntry: OnePieceCardEntry };
  const { setCode, updatedEntry } = body;
  if (!setCode || !updatedEntry?.priceKey) {
    return jsonResponseWithAuthCookies(
      { error: "setCode and updatedEntry.priceKey are required" },
      authCookieResponse,
      { status: 400 },
    );
  }

  const s3 = buildOnePieceS3Client();
  const cards = await getJsonFromOnePieceR2<OnePieceCardEntry[]>(s3, `cards/data/${setCode}.json`);
  if (!cards) {
    return jsonResponseWithAuthCookies(
      { error: `onepiece/cards/data/${setCode}.json not found in R2` },
      authCookieResponse,
      { status: 404 },
    );
  }

  const idx = cards.findIndex((c) => c.priceKey === updatedEntry.priceKey);
  if (idx === -1) {
    return jsonResponseWithAuthCookies(
      { error: `Card ${updatedEntry.priceKey} not found` },
      authCookieResponse,
      { status: 404 },
    );
  }

  cards[idx] = updatedEntry;
  await putJsonToOnePieceR2(s3, `cards/data/${setCode}.json`, cards);

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
