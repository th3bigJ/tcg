import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import {
  fetchTradeById,
  listTradesForShare,
  replaceTradeLines,
  validateTradeLinesForParticipants,
} from "@/lib/tradesServer";
import type { TradeLinePayload } from "@/lib/tradesTypes";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const shareId = new URL(request.url).searchParams.get("shareId")?.trim() ?? "";
  if (!shareId) {
    return jsonResponseWithAuthCookies({ error: "shareId is required" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const cid = Number.parseInt(customer.id, 10);

  const { data: share, error: shareErr } = await supabase
    .from("customer_profile_shares")
    .select("id, owner_customer_id, recipient_customer_id, status")
    .eq("id", shareId)
    .eq("status", "active")
    .maybeSingle();

  if (shareErr || !share) {
    return jsonResponseWithAuthCookies({ error: "Share not found" }, authCookieResponse, { status: 404 });
  }

  const ownerId = Number(share.owner_customer_id);
  const recipientId = share.recipient_customer_id !== null ? Number(share.recipient_customer_id) : null;
  if (recipientId === null || (cid !== ownerId && cid !== recipientId)) {
    return jsonResponseWithAuthCookies({ error: "Forbidden" }, authCookieResponse, { status: 403 });
  }

  const trades = await listTradesForShare(supabase, shareId);
  return jsonResponseWithAuthCookies({ trades }, authCookieResponse);
}

type PostBody = {
  shareId?: string;
  lines?: TradeLinePayload[];
  initiatorMoneyGbp?: number | null;
  counterpartyMoneyGbp?: number | null;
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

  const shareId = typeof body.shareId === "string" ? body.shareId.trim() : "";
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!shareId) {
    return jsonResponseWithAuthCookies({ error: "shareId is required" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const cid = Number.parseInt(customer.id, 10);

  const { data: share, error: shareErr } = await supabase
    .from("customer_profile_shares")
    .select("id, owner_customer_id, recipient_customer_id, status")
    .eq("id", shareId)
    .eq("status", "active")
    .maybeSingle();

  if (shareErr || !share) {
    return jsonResponseWithAuthCookies({ error: "Share not found" }, authCookieResponse, { status: 404 });
  }

  const ownerId = Number(share.owner_customer_id);
  const recipientId = share.recipient_customer_id !== null ? Number(share.recipient_customer_id) : null;
  if (recipientId === null || (cid !== ownerId && cid !== recipientId)) {
    return jsonResponseWithAuthCookies({ error: "Forbidden" }, authCookieResponse, { status: 403 });
  }

  const counterpartyId = cid === ownerId ? recipientId : ownerId;

  const validated = await validateTradeLinesForParticipants(supabase, cid, counterpartyId, lines);
  if (!validated.ok) {
    return jsonResponseWithAuthCookies({ error: validated.error }, authCookieResponse, { status: 400 });
  }

  const initiatorMoney =
    body.initiatorMoneyGbp === null || body.initiatorMoneyGbp === undefined
      ? null
      : typeof body.initiatorMoneyGbp === "number" && Number.isFinite(body.initiatorMoneyGbp) && body.initiatorMoneyGbp >= 0
        ? Math.round(body.initiatorMoneyGbp * 100) / 100
        : null;
  const counterpartyMoney =
    body.counterpartyMoneyGbp === null || body.counterpartyMoneyGbp === undefined
      ? null
      : typeof body.counterpartyMoneyGbp === "number" &&
          Number.isFinite(body.counterpartyMoneyGbp) &&
          body.counterpartyMoneyGbp >= 0
        ? Math.round(body.counterpartyMoneyGbp * 100) / 100
        : null;

  const insertRow: Record<string, unknown> = {
    share_id: shareId,
    initiator_customer_id: cid,
    counterparty_customer_id: counterpartyId,
    status: "draft",
    revision: 1,
    initiator_agreed_revision: 0,
    counterparty_agreed_revision: 0,
    initiator_money_gbp: initiatorMoney,
    counterparty_money_gbp: counterpartyMoney,
    updated_at: new Date().toISOString(),
  };

  const { data: created, error: insErr } = await supabase
    .from("customer_profile_share_trades")
    .insert(insertRow)
    .select("*")
    .single();

  if (insErr || !created) {
    return jsonResponseWithAuthCookies({ error: insErr?.message ?? "Could not create trade" }, authCookieResponse, {
      status: 422,
    });
  }

  const tradeId = String((created as Record<string, unknown>).id);
  const replaced = await replaceTradeLines(supabase, tradeId, 1, lines);
  if (!replaced.ok) {
    await supabase.from("customer_profile_share_trades").delete().eq("id", tradeId);
    return jsonResponseWithAuthCookies({ error: replaced.error }, authCookieResponse, { status: 422 });
  }

  const trade = await fetchTradeById(supabase, tradeId);
  return jsonResponseWithAuthCookies({ trade }, authCookieResponse, { status: 201 });
}
