import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createProfileShare, listIncomingProfileShares, listOutgoingProfileShares } from "@/lib/customerProfileSharesServer";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const [outgoing, incoming] = await Promise.all([
    listOutgoingProfileShares(customer.id),
    listIncomingProfileShares(customer.id),
  ]);

  return jsonResponseWithAuthCookies({ outgoing, incoming }, authCookieResponse);
}

type PostBody = {
  recipientEmail?: string;
};

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail : "";
  const result = await createProfileShare(customer.id, recipientEmail);
  if (!result.ok) {
    return jsonResponseWithAuthCookies({ error: result.error }, authCookieResponse, { status: 400 });
  }

  return jsonResponseWithAuthCookies({ share: result.share }, authCookieResponse);
}
