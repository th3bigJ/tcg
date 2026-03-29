import type { SupabaseClient } from "@supabase/supabase-js";

import type { TradeLinePayload, TradeLineRole, TradeStatus, TradeSummary } from "@/lib/tradesTypes";

function mapTrade(row: Record<string, unknown>): Omit<TradeSummary, "lines"> {
  return {
    id: String(row.id),
    shareId: String(row.share_id),
    initiatorCustomerId: Number(row.initiator_customer_id),
    counterpartyCustomerId: Number(row.counterparty_customer_id),
    status: row.status as TradeStatus,
    revision: Number(row.revision ?? 1),
    initiatorAgreedRevision: Number(row.initiator_agreed_revision ?? 0),
    counterpartyAgreedRevision: Number(row.counterparty_agreed_revision ?? 0),
    initiatorMoneyGbp:
      row.initiator_money_gbp === null || row.initiator_money_gbp === undefined
        ? null
        : Number(row.initiator_money_gbp),
    counterpartyMoneyGbp:
      row.counterparty_money_gbp === null || row.counterparty_money_gbp === undefined
        ? null
        : Number(row.counterparty_money_gbp),
    initiatorExchangeConfirmedAt: row.initiator_exchange_confirmed_at
      ? String(row.initiator_exchange_confirmed_at)
      : null,
    counterpartyExchangeConfirmedAt: row.counterparty_exchange_confirmed_at
      ? String(row.counterparty_exchange_confirmed_at)
      : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapLine(row: Record<string, unknown>): TradeSummary["lines"][number] {
  return {
    id: String(row.id),
    tradeId: String(row.trade_id),
    revision: Number(row.revision ?? 1),
    lineRole: row.line_role as TradeLineRole,
    customerCollectionId: String(row.customer_collection_id),
    quantity: Number(row.quantity ?? 1),
  };
}

export async function listTradesForShare(
  supabase: SupabaseClient,
  shareId: string,
): Promise<TradeSummary[]> {
  const { data: trades, error } = await supabase
    .from("customer_profile_share_trades")
    .select("*")
    .eq("share_id", shareId)
    .order("created_at", { ascending: false });

  if (error || !trades?.length) return [];

  const mapped = (trades as Record<string, unknown>[]).map(mapTrade);
  const ids = mapped.map((t) => t.id);
  const { data: lines } = await supabase
    .from("customer_profile_share_trade_lines")
    .select("*")
    .in("trade_id", ids);

  const byTrade = new Map<string, TradeSummary["lines"]>();
  for (const t of mapped) {
    byTrade.set(t.id, []);
  }
  for (const raw of lines ?? []) {
    const r = raw as Record<string, unknown>;
    const line = mapLine(r);
    const tid = line.tradeId;
    const trade = mapped.find((x) => x.id === tid);
    if (!trade || line.revision !== trade.revision) continue;
    const arr = byTrade.get(tid);
    if (arr) arr.push(line);
  }

  return mapped.map((t) => ({ ...t, lines: byTrade.get(t.id) ?? [] }));
}

export async function fetchTradeById(
  supabase: SupabaseClient,
  tradeId: string,
): Promise<TradeSummary | null> {
  const { data: row, error } = await supabase
    .from("customer_profile_share_trades")
    .select("*")
    .eq("id", tradeId)
    .maybeSingle();

  if (error || !row) return null;
  const trade = mapTrade(row as Record<string, unknown>);
  const { data: lines } = await supabase
    .from("customer_profile_share_trade_lines")
    .select("*")
    .eq("trade_id", tradeId)
    .eq("revision", trade.revision);

  const mappedLines = (lines ?? []).map((l) => mapLine(l as Record<string, unknown>));
  return { ...trade, lines: mappedLines };
}

export async function notifyTradeParticipant(
  supabase: SupabaseClient,
  tradeId: string,
  recipientCustomerId: number,
  body: string,
): Promise<void> {
  await supabase.from("customer_trade_notifications").insert({
    customer_id: recipientCustomerId,
    trade_id: tradeId,
    body,
  });
}

type LineCheck = {
  id: string;
  customer_id: string | number;
  quantity: number | null;
};

export async function validateTradeLinesForParticipants(
  supabase: SupabaseClient,
  initiatorId: number,
  counterpartyId: number,
  lines: TradeLinePayload[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!lines.length) {
    return { ok: false, error: "Add at least one card to the trade." };
  }

  const ids = [...new Set(lines.map((l) => l.customerCollectionId))];
  const { data: rows, error } = await supabase
    .from("customer_collections")
    .select("id, customer_id, quantity")
    .in("id", ids);

  if (error || !rows?.length) {
    return { ok: false, error: "Could not load collection lines." };
  }

  const byId = new Map<string, LineCheck>();
  for (const r of rows as LineCheck[]) {
    byId.set(String(r.id), r);
  }

  for (const line of lines) {
    const row = byId.get(line.customerCollectionId);
    if (!row) {
      return { ok: false, error: "Unknown collection line." };
    }
    const cid = Number(row.customer_id);
    const q = typeof row.quantity === "number" && Number.isFinite(row.quantity) ? Math.floor(row.quantity) : 0;
    if (line.quantity < 1 || !Number.isFinite(line.quantity)) {
      return { ok: false, error: "Invalid quantity." };
    }
    if (q < line.quantity) {
      return { ok: false, error: "Not enough copies on one or more lines." };
    }
    if (line.lineRole === "initiator_offers" && cid !== initiatorId) {
      return { ok: false, error: "You can only offer cards from your own collection." };
    }
    if (line.lineRole === "initiator_requests" && cid !== counterpartyId) {
      return { ok: false, error: "You can only request cards from the other collector's collection." };
    }
  }

  return { ok: true };
}

export async function replaceTradeLines(
  supabase: SupabaseClient,
  tradeId: string,
  revision: number,
  lines: TradeLinePayload[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: delErr } = await supabase
    .from("customer_profile_share_trade_lines")
    .delete()
    .eq("trade_id", tradeId)
    .eq("revision", revision);

  if (delErr) {
    return { ok: false, error: delErr.message };
  }

  return insertTradeLines(supabase, tradeId, revision, lines);
}

export async function insertTradeLines(
  supabase: SupabaseClient,
  tradeId: string,
  revision: number,
  lines: TradeLinePayload[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!lines.length) {
    return { ok: false, error: "Add at least one card to the trade." };
  }
  const inserts = lines.map((l) => ({
    trade_id: tradeId,
    revision,
    line_role: l.lineRole,
    customer_collection_id: l.customerCollectionId,
    quantity: l.quantity,
  }));

  const { error: insErr } = await supabase.from("customer_profile_share_trade_lines").insert(inserts);
  if (insErr) {
    return { ok: false, error: insErr.message };
  }
  return { ok: true };
}
