import type { SupabaseClient } from "@supabase/supabase-js";

export type TradeNotificationListItem = {
  id: string;
  body: string;
  createdAt: string;
  tradeId: string | null;
  shareId: string | null;
};

export async function countUnreadTradeNotifications(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("customer_trade_notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);

  if (error || count == null) return 0;
  return count;
}

function mapNestedShareId(row: Record<string, unknown>): string | null {
  const nested = row.customer_profile_share_trades;
  if (nested == null) return null;
  if (Array.isArray(nested)) {
    const first = nested[0] as { share_id?: unknown } | undefined;
    return first?.share_id != null ? String(first.share_id) : null;
  }
  const o = nested as { share_id?: unknown };
  return o.share_id != null ? String(o.share_id) : null;
}

function mapNotificationRows(rows: Record<string, unknown>[]): TradeNotificationListItem[] {
  return rows.map((row) => ({
    id: String(row.id),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? ""),
    tradeId: row.trade_id != null ? String(row.trade_id) : null,
    shareId: mapNestedShareId(row),
  }));
}

export async function listUnreadTradeNotifications(supabase: SupabaseClient): Promise<TradeNotificationListItem[]> {
  const { data, error } = await supabase
    .from("customer_trade_notifications")
    .select("id, body, created_at, trade_id, customer_profile_share_trades(share_id)")
    .is("read_at", null)
    .order("created_at", { ascending: false });

  if (!error && data !== null) {
    if (!data.length) return [];
    return mapNotificationRows(data as Record<string, unknown>[]);
  }

  const { data: rows, error: err2 } = await supabase
    .from("customer_trade_notifications")
    .select("id, body, created_at, trade_id")
    .is("read_at", null)
    .order("created_at", { ascending: false });

  if (err2 || !rows?.length) return [];

  const tradeIds = [
    ...new Set(
      (rows as { trade_id?: string | null }[])
        .map((r) => r.trade_id)
        .filter((id): id is string => id != null && id !== ""),
    ),
  ];

  const shareByTradeId = new Map<string, string>();
  if (tradeIds.length > 0) {
    const { data: trows } = await supabase
      .from("customer_profile_share_trades")
      .select("id, share_id")
      .in("id", tradeIds);
    for (const t of trows ?? []) {
      const tr = t as { id: string; share_id: string };
      shareByTradeId.set(String(tr.id), String(tr.share_id));
    }
  }

  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? ""),
    tradeId: row.trade_id != null ? String(row.trade_id) : null,
    shareId: row.trade_id != null ? shareByTradeId.get(String(row.trade_id)) ?? null : null,
  }));
}

export async function markTradeNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("customer_trade_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
