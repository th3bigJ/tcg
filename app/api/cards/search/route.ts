import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getAllCards, getAllSets } from "@/lib/staticCards";

let _setNameMap: Map<string, string> | null = null;
function getSetNameMap(): Map<string, string> {
  if (!_setNameMap) {
    _setNameMap = new Map();
    for (const s of getAllSets()) {
      const code = s.code ?? s.tcgdexId;
      if (code && s.name) _setNameMap.set(code, s.name);
    }
  }
  return _setNameMap;
}

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return jsonResponseWithAuthCookies({ docs: [] }, authCookieResponse);
  }

  const qLower = q.toLocaleLowerCase();
  const setNameMap = getSetNameMap();

  const docs = getAllCards()
    .filter((c) => c.imageLowSrc && c.cardName.toLocaleLowerCase().includes(qLower))
    .slice(0, 20)
    .map((c) => ({
      id: c.masterCardId,
      cardName: c.cardName,
      setName: setNameMap.get(c.setCode) ?? "",
    }));

  return jsonResponseWithAuthCookies({ docs }, authCookieResponse);
}
