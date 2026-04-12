import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { buildOnePieceS3Client, getJsonFromOnePieceR2, putJsonToOnePieceR2 } from "@/lib/onepieceR2";

type OnePieceSetEntry = { id: string; setCode: string; [key: string]: unknown };

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const body = await request.json() as { updatedEntry: OnePieceSetEntry };
  const { updatedEntry } = body;
  if (!updatedEntry?.id) {
    return jsonResponseWithAuthCookies({ error: "updatedEntry.id is required" }, authCookieResponse, { status: 400 });
  }

  const s3 = buildOnePieceS3Client();
  const sets = await getJsonFromOnePieceR2<OnePieceSetEntry[]>(s3, "sets/data/sets.json");
  if (!sets) {
    return jsonResponseWithAuthCookies(
      { error: "onepiece/sets/data/sets.json not found in R2" },
      authCookieResponse,
      { status: 404 },
    );
  }

  const idx = sets.findIndex((s) => s.id === updatedEntry.id);
  if (idx === -1) {
    return jsonResponseWithAuthCookies(
      { error: `Set id ${updatedEntry.id} not found` },
      authCookieResponse,
      { status: 404 },
    );
  }

  sets[idx] = updatedEntry;
  await putJsonToOnePieceR2(s3, "sets/data/sets.json", sets);

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
