import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getJsonFromR2, putJsonToR2 } from "@/lib/adminR2";
import type { SetJsonEntry } from "@/lib/staticDataTypes";

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const body = await request.json() as { updatedEntry: SetJsonEntry };
  const { updatedEntry } = body;
  if (!updatedEntry?.id) {
    return jsonResponseWithAuthCookies({ error: "updatedEntry.id is required" }, authCookieResponse, { status: 400 });
  }

  const sets = await getJsonFromR2<SetJsonEntry[]>("data/sets.json");
  if (!sets) {
    return jsonResponseWithAuthCookies({ error: "sets.json not found in R2" }, authCookieResponse, { status: 404 });
  }

  const idx = sets.findIndex((s) => s.id === updatedEntry.id);
  if (idx === -1) {
    return jsonResponseWithAuthCookies({ error: `Set id ${updatedEntry.id} not found` }, authCookieResponse, { status: 404 });
  }

  sets[idx] = updatedEntry;
  await putJsonToR2("data/sets.json", sets);

  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
