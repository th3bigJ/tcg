"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SharedTradeHorizontalPreview } from "@/app/(app)/collect/shared/[shareId]/sharedTradeHorizontalPreview";
import type { StorefrontCardEntry } from "@/lib/storefrontCardMaps";
import type { TradeSummary } from "@/lib/tradesTypes";

type Props = {
  shareId: string;
  viewerCustomerId: string;
  counterpartyDisplayName: string;
  viewerCollectionEntries: StorefrontCardEntry[];
  counterpartyCollectionEntries: StorefrontCardEntry[];
};

export function SharedCollectionTradesClient({
  shareId,
  viewerCustomerId,
  counterpartyDisplayName,
  viewerCollectionEntries,
  counterpartyCollectionEntries,
}: Props) {
  const [trades, setTrades] = useState<TradeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewerIdNum = Number.parseInt(viewerCustomerId, 10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades?shareId=${encodeURIComponent(shareId)}`, { credentials: "include" });
      const json = (await res.json()) as { trades?: TradeSummary[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not load trades");
        setTrades([]);
        return;
      }
      setTrades(json.trades ?? []);
    } catch {
      setError("Could not load trades");
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }, [shareId]);

  useEffect(() => {
    void load();
  }, [load]);

  const viewerByLineId = useMemo(() => {
    const m = new Map<string, StorefrontCardEntry>();
    for (const e of viewerCollectionEntries) {
      if (e.collectionEntryId) m.set(e.collectionEntryId, e);
    }
    return m;
  }, [viewerCollectionEntries]);

  const counterpartyByLineId = useMemo(() => {
    const m = new Map<string, StorefrontCardEntry>();
    for (const e of counterpartyCollectionEntries) {
      if (e.collectionEntryId) m.set(e.collectionEntryId, e);
    }
    return m;
  }, [counterpartyCollectionEntries]);

  const newTradeHref = `/collect/shared/${encodeURIComponent(shareId)}/trade/new`;

  return (
    <div className="mt-6 space-y-6 px-4 pb-[var(--bottom-nav-offset)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--foreground)]/70">Trade with {counterpartyDisplayName}.</p>
        <Link
          href={newTradeHref}
          className="shrink-0 rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-3 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/14"
        >
          New trade
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--foreground)]/60">Loading trades…</p>
      ) : trades.length === 0 ? (
        <p className="text-sm text-[var(--foreground)]/60">No trades yet.</p>
      ) : (
        <ul className="space-y-4">
          {trades.map((t) => (
            <li key={t.id} className="rounded-lg border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">{t.status}</span>
                <span className="text-xs text-[var(--foreground)]/45">rev {t.revision}</span>
              </div>
              <SharedTradeHorizontalPreview
                trade={t}
                viewerIdNum={viewerIdNum}
                viewerByLineId={viewerByLineId}
                counterpartyByLineId={counterpartyByLineId}
                counterpartyDisplayName={counterpartyDisplayName}
              />
              <Link
                href={`/collect/shared/${encodeURIComponent(shareId)}/trade/${encodeURIComponent(t.id)}`}
                className="mt-4 flex w-full items-center justify-center rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 py-2.5 text-sm font-medium transition hover:bg-[var(--foreground)]/14"
              >
                View trade
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
