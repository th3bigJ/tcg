import { formatTradeGbp } from "@/app/(app)/collect/shared/[shareId]/sharedTradeHorizontalPreview";
import type { ViewerTradeTotals } from "@/app/(app)/collect/shared/[shareId]/sharedTradeViewerTotals";

export function SharedTradeValueSummary({
  counterpartyFirstName,
  totals,
}: {
  counterpartyFirstName: string;
  totals: ViewerTradeTotals;
}) {
  const { youOfferCardGbp, youReceiveCardGbp, youCashGbp, theyCashGbp, youGiveTotalGbp, youReceiveTotalGbp, balanceGbp } =
    totals;

  return (
    <div className="mt-6 rounded-lg border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/55">Trade value summary</p>
      <dl className="mt-3 space-y-2 text-sm tabular-nums text-[var(--foreground)]/85">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--foreground)]/65">You give (cards)</dt>
          <dd>{formatTradeGbp(youOfferCardGbp)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--foreground)]/65">You receive (cards)</dt>
          <dd>{formatTradeGbp(youReceiveCardGbp)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--foreground)]/65">Cash you add</dt>
          <dd>{youCashGbp > 0 ? formatTradeGbp(youCashGbp) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--foreground)]/65">Cash {counterpartyFirstName} adds</dt>
          <dd>{theyCashGbp > 0 ? formatTradeGbp(theyCashGbp) : "—"}</dd>
        </div>
        <div className="border-t border-[var(--foreground)]/10 pt-2" />
        <div className="flex justify-between gap-3 font-medium text-[var(--foreground)]">
          <dt>Your side total</dt>
          <dd>{formatTradeGbp(youGiveTotalGbp)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-medium text-[var(--foreground)]">
          <dt>Their side total</dt>
          <dd>{formatTradeGbp(youReceiveTotalGbp)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-[var(--foreground)]/80">
          <dt>Balance (you give − you receive)</dt>
          <dd>
            {Math.abs(balanceGbp) < 0.01 ? (
              <span className="text-emerald-500">Even</span>
            ) : balanceGbp > 0 ? (
              <span>You +{formatTradeGbp(balanceGbp)}</span>
            ) : (
              <span>You {formatTradeGbp(balanceGbp)}</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-[var(--foreground)]/50">Values use the same guide prices as the catalogue (estimates).</p>
    </div>
  );
}
