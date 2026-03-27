import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { getRelationshipDocumentId } from "@/lib/relationshipId";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

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

  const payload = await getPayload({ config });

  const result = await payload.find({
    collection: "master-card-list",
    where: {
      and: [
        { imageLow: { exists: true } },
        { cardName: { like: q } },
      ],
    },
    select: {
      cardName: true,
      set: true,
      filename: true,
    },
    depth: 1,
    limit: 20,
    overrideAccess: true,
  });

  const docs = result.docs.map((doc) => {
    const id = getRelationshipDocumentId(doc.id);
    const setDoc = (doc as Record<string, unknown>).set;
    const setName =
      setDoc && typeof setDoc === "object" && "name" in setDoc
        ? String((setDoc as { name?: unknown }).name ?? "")
        : "";
    return {
      id,
      cardName: (doc as Record<string, unknown>).cardName ?? "",
      setName,
    };
  });

  return jsonResponseWithAuthCookies({ docs }, authCookieResponse);
}
