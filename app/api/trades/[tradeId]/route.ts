import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import {
  fetchTradeById,
  insertTradeLines,
  notifyTradeParticipant,
  replaceTradeLines,
  validateTradeLinesForParticipants,
} from "@/lib/tradesServer";
import type { TradeLinePayload, TradeStatus } from "@/lib/tradesTypes";

type RouteParams = { params: Promise<{ tradeId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { tradeId } = await params;
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const trade = await fetchTradeById(supabase, tradeId);
  if (!trade) {
    return jsonResponseWithAuthCookies({ error: "Not found" }, authCookieResponse, { status: 404 });
  }

  const cid = Number.parseInt(customer.id, 10);
  if (trade.initiatorCustomerId !== cid && trade.counterpartyCustomerId !== cid) {
    return jsonResponseWithAuthCookies({ error: "Forbidden" }, authCookieResponse, { status: 403 });
  }

  return jsonResponseWithAuthCookies({ trade }, authCookieResponse);
}

type PatchBody = {
  action?:
    | "save_draft"
    | "send_offer"
    | "counter"
    | "accept"
    | "decline"
    | "cancel"
    | "confirm_exchange";
  lines?: TradeLinePayload[];
  initiatorMoneyGbp?: number | null;
  counterpartyMoneyGbp?: number | null;
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { tradeId } = await params;
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const action = body.action;
  if (!action) {
    return jsonResponseWithAuthCookies({ error: "action is required" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const cid = Number.parseInt(customer.id, 10);

  const trade = await fetchTradeById(supabase, tradeId);
  if (!trade) {
    return jsonResponseWithAuthCookies({ error: "Not found" }, authCookieResponse, { status: 404 });
  }

  if (trade.initiatorCustomerId !== cid && trade.counterpartyCustomerId !== cid) {
    return jsonResponseWithAuthCookies({ error: "Forbidden" }, authCookieResponse, { status: 403 });
  }

  const isInitiator = trade.initiatorCustomerId === cid;
  const otherId = isInitiator ? trade.counterpartyCustomerId : trade.initiatorCustomerId;
  const status = trade.status as TradeStatus;

  const nowIso = new Date().toISOString();

  if (action === "save_draft") {
    if (!isInitiator || status !== "draft") {
      return jsonResponseWithAuthCookies({ error: "Only the initiator can edit a draft." }, authCookieResponse, {
        status: 400,
      });
    }
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const v = await validateTradeLinesForParticipants(supabase, trade.initiatorCustomerId, trade.counterpartyCustomerId, lines);
    if (!v.ok) {
      return jsonResponseWithAuthCookies({ error: v.error }, authCookieResponse, { status: 400 });
    }
    const { error: uErr } = await supabase
      .from("customer_profile_share_trades")
      .update({
        initiator_money_gbp: normalizeMoney(body.initiatorMoneyGbp),
        counterparty_money_gbp: normalizeMoney(body.counterpartyMoneyGbp),
        updated_at: nowIso,
      })
      .eq("id", tradeId)
      .eq("status", "draft");

    if (uErr) {
      return jsonResponseWithAuthCookies({ error: uErr.message }, authCookieResponse, { status: 422 });
    }

    const r = await replaceTradeLines(supabase, tradeId, trade.revision, lines);
    if (!r.ok) {
      return jsonResponseWithAuthCookies({ error: r.error }, authCookieResponse, { status: 422 });
    }

    const next = await fetchTradeById(supabase, tradeId);
    return jsonResponseWithAuthCookies({ trade: next }, authCookieResponse);
  }

  if (action === "send_offer") {
    if (!isInitiator || status !== "draft") {
      return jsonResponseWithAuthCookies({ error: "Only the initiator can send the offer from a draft." }, authCookieResponse, {
        status: 400,
      });
    }
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const v = await validateTradeLinesForParticipants(supabase, trade.initiatorCustomerId, trade.counterpartyCustomerId, lines);
    if (!v.ok) {
      return jsonResponseWithAuthCookies({ error: v.error }, authCookieResponse, { status: 400 });
    }

    const r = await replaceTradeLines(supabase, tradeId, trade.revision, lines);
    if (!r.ok) {
      return jsonResponseWithAuthCookies({ error: r.error }, authCookieResponse, { status: 422 });
    }

    const { error: uErr } = await supabase
      .from("customer_profile_share_trades")
      .update({
        status: "offered",
        initiator_agreed_revision: trade.revision,
        counterparty_agreed_revision: 0,
        initiator_money_gbp: normalizeMoney(body.initiatorMoneyGbp),
        counterparty_money_gbp: normalizeMoney(body.counterpartyMoneyGbp),
        updated_at: nowIso,
      })
      .eq("id", tradeId)
      .eq("status", "draft");

    if (uErr) {
      return jsonResponseWithAuthCookies({ error: uErr.message }, authCookieResponse, { status: 422 });
    }

    await notifyTradeParticipant(
      supabase,
      tradeId,
      otherId,
      "You have a new trade offer.",
    );

    const next = await fetchTradeById(supabase, tradeId);
    return jsonResponseWithAuthCookies({ trade: next }, authCookieResponse);
  }

  if (action === "counter") {
    if (status !== "offered") {
      return jsonResponseWithAuthCookies({ error: "You can only counter while the trade is offered." }, authCookieResponse, {
        status: 400,
      });
    }
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const v = await validateTradeLinesForParticipants(supabase, trade.initiatorCustomerId, trade.counterpartyCustomerId, lines);
    if (!v.ok) {
      return jsonResponseWithAuthCookies({ error: v.error }, authCookieResponse, { status: 400 });
    }

    const newRev = trade.revision + 1;
    const ins = await insertTradeLines(supabase, tradeId, newRev, lines);
    if (!ins.ok) {
      return jsonResponseWithAuthCookies({ error: ins.error }, authCookieResponse, { status: 422 });
    }

    const nextAgreeInit = isInitiator ? newRev : 0;
    const nextAgreeCp = isInitiator ? 0 : newRev;

    const { error: uErr } = await supabase
      .from("customer_profile_share_trades")
      .update({
        revision: newRev,
        initiator_agreed_revision: nextAgreeInit,
        counterparty_agreed_revision: nextAgreeCp,
        initiator_money_gbp: normalizeMoney(body.initiatorMoneyGbp),
        counterparty_money_gbp: normalizeMoney(body.counterpartyMoneyGbp),
        updated_at: nowIso,
      })
      .eq("id", tradeId)
      .eq("status", "offered");

    if (uErr) {
      return jsonResponseWithAuthCookies({ error: uErr.message }, authCookieResponse, { status: 422 });
    }

    await notifyTradeParticipant(
      supabase,
      tradeId,
      otherId,
      "A trade was updated with a new offer.",
    );

    const next = await fetchTradeById(supabase, tradeId);
    return jsonResponseWithAuthCookies({ trade: next }, authCookieResponse);
  }

  if (action === "accept") {
    if (status !== "offered") {
      return jsonResponseWithAuthCookies({ error: "Nothing to accept right now." }, authCookieResponse, { status: 400 });
    }

    let nextInit = trade.initiatorAgreedRevision;
    let nextCp = trade.counterpartyAgreedRevision;
    if (isInitiator) {
      nextInit = trade.revision;
    } else {
      nextCp = trade.revision;
    }

    let nextStatus: TradeStatus = status;
    if (nextInit >= trade.revision && nextCp >= trade.revision) {
      nextStatus = "accepted";
    }

    const { error: uErr } = await supabase
      .from("customer_profile_share_trades")
      .update({
        initiator_agreed_revision: nextInit,
        counterparty_agreed_revision: nextCp,
        status: nextStatus,
        updated_at: nowIso,
      })
      .eq("id", tradeId)
      .eq("status", "offered");

    if (uErr) {
      return jsonResponseWithAuthCookies({ error: uErr.message }, authCookieResponse, { status: 422 });
    }

    await notifyTradeParticipant(
      supabase,
      tradeId,
      otherId,
      nextStatus === "accepted" ? "Trade accepted — confirm when you exchange in person." : "The other party accepted the latest trade terms.",
    );

    const next = await fetchTradeById(supabase, tradeId);
    return jsonResponseWithAuthCookies({ trade: next }, authCookieResponse);
  }

  if (action === "decline") {
    if (isInitiator || status !== "offered") {
      return jsonResponseWithAuthCookies({ error: "Only the other party can decline an open offer." }, authCookieResponse, {
        status: 400,
      });
    }

    const { error: uErr } = await supabase
      .from("customer_profile_share_trades")
      .update({ status: "declined", updated_at: nowIso })
      .eq("id", tradeId)
      .eq("status", "offered");

    if (uErr) {
      return jsonResponseWithAuthCookies({ error: uErr.message }, authCookieResponse, { status: 422 });
    }

    await notifyTradeParticipant(supabase, tradeId, trade.initiatorCustomerId, "Your trade offer was declined.");

    const next = await fetchTradeById(supabase, tradeId);
    return jsonResponseWithAuthCookies({ trade: next }, authCookieResponse);
  }

  if (action === "cancel") {
    if (status !== "draft" && status !== "offered") {
      return jsonResponseWithAuthCookies({ error: "This trade cannot be cancelled." }, authCookieResponse, { status: 400 });
    }
    if (status === "draft" && !isInitiator) {
      return jsonResponseWithAuthCookies({ error: "Only the initiator can cancel a draft." }, authCookieResponse, {
        status: 400,
      });
    }

    await notifyTradeParticipant(supabase, tradeId, otherId, "A trade was cancelled.");

    const { error: dErr } = await supabase.from("customer_profile_share_trades").delete().eq("id", tradeId).in("status", ["draft", "offered"]);

    if (dErr) {
      return jsonResponseWithAuthCookies({ error: dErr.message }, authCookieResponse, { status: 422 });
    }

    return jsonResponseWithAuthCookies({ deleted: true as const }, authCookieResponse);
  }

  if (action === "confirm_exchange") {
    if (status !== "accepted") {
      return jsonResponseWithAuthCookies({ error: "Confirm exchange is only available after the trade is accepted." }, authCookieResponse, {
        status: 400,
      });
    }

    const patch: Record<string, unknown> = { updated_at: nowIso };
    if (isInitiator) {
      patch.initiator_exchange_confirmed_at = nowIso;
    } else {
      patch.counterparty_exchange_confirmed_at = nowIso;
    }

    const { error: uErr } = await supabase.from("customer_profile_share_trades").update(patch).eq("id", tradeId).eq("status", "accepted");

    if (uErr) {
      return jsonResponseWithAuthCookies({ error: uErr.message }, authCookieResponse, { status: 422 });
    }

    const fresh = await fetchTradeById(supabase, tradeId);
    if (!fresh) {
      return jsonResponseWithAuthCookies({ error: "Not found" }, authCookieResponse, { status: 404 });
    }

    if (fresh.initiatorExchangeConfirmedAt && fresh.counterpartyExchangeConfirmedAt) {
      const { error: rpcErr } = await supabase.rpc("complete_profile_share_trade", { p_trade_id: tradeId });
      if (rpcErr) {
        return jsonResponseWithAuthCookies({ error: rpcErr.message }, authCookieResponse, { status: 422 });
      }
    } else {
      await notifyTradeParticipant(
        supabase,
        tradeId,
        otherId,
        "The other party confirmed the in-person exchange. Confirm yours when done.",
      );
    }

    const done = await fetchTradeById(supabase, tradeId);
    return jsonResponseWithAuthCookies({ trade: done }, authCookieResponse);
  }

  return jsonResponseWithAuthCookies({ error: "Unknown action" }, authCookieResponse, { status: 400 });
}

function normalizeMoney(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
    return Math.round(v * 100) / 100;
  }
  return null;
}
