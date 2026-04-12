import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getJsonFromR2, putJsonToR2 } from "@/lib/adminR2";
import type { CardJsonEntry } from "@/lib/staticDataTypes";

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const body = await request.json() as { setCode: string; updatedEntry: CardJsonEntry };
  const { setCode, updatedEntry } = body;
  if (!setCode || !updatedEntry?.masterCardId) {
    return jsonResponseWithAuthCookies(
      { error: "setCode and updatedEntry.masterCardId are required" },
      authCookieResponse,
      { status: 400 },
    );
  }

  const cards = await getJsonFromR2<CardJsonEntry[]>(`data/cards/${setCode}.json`);
  if (!cards) {
    return jsonResponseWithAuthCookies(
      { error: `data/cards/${setCode}.json not found in R2` },
      authCookieResponse,
      { status: 404 },
    );
  }

  const idx = cards.findIndex((c) => c.masterCardId === updatedEntry.masterCardId);
  if (idx === -1) {
    return jsonResponseWithAuthCookies(
      { error: `Card ${updatedEntry.masterCardId} not found` },
      authCookieResponse,
      { status: 404 },
    );
  }

  cards[idx] = updatedEntry;
  await putJsonToR2(`data/cards/${setCode}.json`, cards);

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
