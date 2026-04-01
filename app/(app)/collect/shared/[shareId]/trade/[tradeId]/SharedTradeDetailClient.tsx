"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SharedTradeDetailRichView } from "@/app/(app)/collect/shared/[shareId]/sharedTradeDetailRichView";
import { SharedTradeValueSummary } from "@/app/(app)/collect/shared/[shareId]/sharedTradeValueSummary";
import { computeViewerTradeTotals } from "@/app/(app)/collect/shared/[shareId]/sharedTradeViewerTotals";
import type { CollectionLineSummary, StorefrontCardEntry } from "@/lib/storefrontCardMaps";
import type { TradeSummary } from "@/lib/tradesTypes";

type Props = {
  shareId: string;
  tradeId: string;
  viewerCustomerId: string;
  counterpartyDisplayName: string;
  viewerCollectionEntries: StorefrontCardEntry[];
  counterpartyCollectionEntries: StorefrontCardEntry[];
  viewerTradeCardPricesByMasterCardId: Record<string, number>;
  counterpartyTradeCardPricesByMasterCardId: Record<string, number>;
  setLogosByCode: Record<string, string>;
  setSymbolsByCode: Record<string, string>;
  itemConditions: { id: string; name: string }[];
  viewerTradeCollectionLinesByMasterCardId: Record<string, CollectionLineSummary[]>;
  counterpartyTradeCollectionLinesByMasterCardId: Record<string, CollectionLineSummary[]>;
  viewerTradeManualPriceMasterCardIds: string[];
  counterpartyTradeManualPriceMasterCardIds: string[];
  viewerTradeGradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
  counterpartyTradeGradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
};

const btnPrimary =
  "inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-md border border-[var(--foreground)]/30 bg-[var(--foreground)]/12 px-3 py-2 text-sm font-semibold transition hover:bg-[var(--foreground)]/18 disabled:cursor-not-allowed disabled:opacity-50";
const btnSecondary =
  "inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-md border border-[var(--foreground)]/25 bg-[var(--background)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/8 disabled:cursor-not-allowed disabled:opacity-50";
const btnDanger =
  "inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-md border border-red-600/35 bg-red-600/10 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-600/16 dark:text-red-300 dark:hover:bg-red-600/20 disabled:cursor-not-allowed disabled:opacity-50";

export function SharedTradeDetailClient({
  shareId,
  tradeId,
  viewerCustomerId,
  counterpartyDisplayName,
  viewerCollectionEntries,
  counterpartyCollectionEntries,
  viewerTradeCardPricesByMasterCardId,
  counterpartyTradeCardPricesByMasterCardId,
  setLogosByCode,
  setSymbolsByCode,
  itemConditions,
  viewerTradeCollectionLinesByMasterCardId,
  counterpartyTradeCollectionLinesByMasterCardId,
  viewerTradeManualPriceMasterCardIds,
  counterpartyTradeManualPriceMasterCardIds,
  viewerTradeGradingByMasterCardId,
  counterpartyTradeGradingByMasterCardId,
}: Props) {
  const router = useRouter();
  const [trade, setTrade] = useState<TradeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const viewerIdNum = Number.parseInt(viewerCustomerId, 10);

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

  const counterpartyFirstName = counterpartyDisplayName.trim().split(/\s+/)[0] ?? "Them";

  const valueTotals = useMemo(() => {
    if (!trade) return null;
    return computeViewerTradeTotals(
      trade,
      viewerIdNum,
      viewerByLineId,
      counterpartyByLineId,
      viewerTradeCardPricesByMasterCardId,
      counterpartyTradeCardPricesByMasterCardId,
    );
  }, [
    trade,
    viewerIdNum,
    viewerByLineId,
    counterpartyByLineId,
    viewerTradeCardPricesByMasterCardId,
    counterpartyTradeCardPricesByMasterCardId,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${encodeURIComponent(tradeId)}`, { credentials: "include" });
      const json = (await res.json()) as { trade?: TradeSummary; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not load trade");
        setTrade(null);
        return;
      }
      const t = json.trade;
      if (!t) {
        setError("Trade not found");
        setTrade(null);
        return;
      }
      if (t.shareId !== shareId) {
        setError("This trade does not belong to this share.");
        setTrade(null);
        return;
      }
      setTrade(t);
    } catch {
      setError("Could not load trade");
      setTrade(null);
    } finally {
      setLoading(false);
    }
  }, [tradeId, shareId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchTrade = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${encodeURIComponent(tradeId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { trade?: TradeSummary; deleted?: boolean; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Request failed");
        return false;
      }
      if (json.deleted) {
        router.push(backHref);
        router.refresh();
        return true;
      }
      if (json.trade) setTrade(json.trade);
      router.refresh();
      return true;
    } catch {
      setError("Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const backHref = `/collect/shared/${encodeURIComponent(shareId)}?tab=trade`;

  const tradeActions = (t: TradeSummary) => {
    const isInitiator = t.initiatorCustomerId === viewerIdNum;
    const needsMyAccept =
      t.status === "offered" &&
      (isInitiator ? t.initiatorAgreedRevision < t.revision : t.counterpartyAgreedRevision < t.revision);

    const amendHref = `/collect/shared/${encodeURIComponent(shareId)}/trade/new?amend=${encodeURIComponent(t.id)}`;

    if (t.status === "draft" && isInitiator) {
      return (
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void patchTrade({
                action: "send_offer",
                lines: t.lines.map((l) => ({
                  lineRole: l.lineRole,
                  customerCollectionId: l.customerCollectionId,
                  quantity: l.quantity,
                })),
                initiatorMoneyGbp: t.initiatorMoneyGbp,
                counterpartyMoneyGbp: t.counterpartyMoneyGbp,
              })
            }
            className={btnPrimary}
          >
            Send offer
          </button>
          <button type="button" disabled={busy} onClick={() => void patchTrade({ action: "cancel" })} className={btnSecondary}>
            Cancel
          </button>
        </div>
      );
    }

    if (t.status === "offered") {
      return (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {!isInitiator ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void patchTrade({ action: "decline" })}
                className={btnDanger}
              >
                Decline trade
              </button>
            ) : null}
            <Link href={amendHref} className={btnSecondary}>
              Amend trade
            </Link>
            {needsMyAccept ? (
              <button type="button" disabled={busy} onClick={() => void patchTrade({ action: "accept" })} className={btnPrimary}>
                Accept trade
              </button>
            ) : (
              <p className="flex w-full min-w-[12rem] flex-1 items-center justify-center rounded-md border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 px-3 py-2 text-center text-xs text-[var(--foreground)]/55">
                Latest terms accepted on your side — waiting for the other party if needed.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void patchTrade({ action: "cancel" })}
            className={`${btnDanger} w-full`}
          >
            Cancel trade
          </button>
        </div>
      );
    }

    if (t.status === "accepted") {
      const mine = isInitiator ? t.initiatorExchangeConfirmedAt : t.counterpartyExchangeConfirmedAt;
      return (
        <div className="mt-6 space-y-2">
          <p className="text-xs text-[var(--foreground)]/60">
            Confirm once you have swapped cards in person. Money is recorded for reference only; settle outside the app.
          </p>
          {!mine ? (
            <button type="button" disabled={busy} onClick={() => void patchTrade({ action: "confirm_exchange" })} className={btnPrimary}>
              I completed the exchange
            </button>
          ) : (
            <p className="text-xs text-[var(--foreground)]/55">Waiting for {counterpartyDisplayName} to confirm.</p>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="shrink-0 border-b border-[var(--foreground)]/10 px-4 pb-4 pt-2">
        <Link
          href={backHref}
          className="text-sm font-medium text-[var(--foreground)]/65 transition hover:text-[var(--foreground)]"
        >
          ← Trade with {counterpartyDisplayName}
        </Link>
        <h1 className="mt-4 text-xl font-semibold leading-tight">Trade offer</h1>
      </div>

      <div className="px-4 pb-[var(--bottom-nav-offset)] pt-4">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-[var(--foreground)]/60">Loading…</p>
        ) : trade ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">{trade.status}</span>
              <span className="text-xs text-[var(--foreground)]/45">rev {trade.revision}</span>
            </div>
            <SharedTradeDetailRichView
              trade={trade}
              viewerIdNum={viewerIdNum}
              viewerByLineId={viewerByLineId}
              counterpartyByLineId={counterpartyByLineId}
              counterpartyDisplayName={counterpartyDisplayName}
              viewerPricesByGroupKey={viewerTradeCardPricesByMasterCardId}
              counterpartyPricesByGroupKey={counterpartyTradeCardPricesByMasterCardId}
              setLogosByCode={setLogosByCode}
              setSymbolsByCode={setSymbolsByCode}
              itemConditions={itemConditions}
              viewerTradeCollectionLinesByMasterCardId={viewerTradeCollectionLinesByMasterCardId}
              counterpartyTradeCollectionLinesByMasterCardId={counterpartyTradeCollectionLinesByMasterCardId}
              viewerTradeManualPriceMasterCardIds={viewerTradeManualPriceMasterCardIds}
              counterpartyTradeManualPriceMasterCardIds={counterpartyTradeManualPriceMasterCardIds}
              viewerTradeGradingByMasterCardId={viewerTradeGradingByMasterCardId}
              counterpartyTradeGradingByMasterCardId={counterpartyTradeGradingByMasterCardId}
            />
            {valueTotals ? (
              <SharedTradeValueSummary counterpartyFirstName={counterpartyFirstName} totals={valueTotals} />
            ) : null}
            {tradeActions(trade)}
          </>
        ) : null}
      </div>
    </div>
  );
}
