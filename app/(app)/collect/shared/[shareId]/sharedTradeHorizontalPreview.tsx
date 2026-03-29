import type { StorefrontCardEntry } from "@/lib/storefrontCardMaps";
import type { TradeLineRow, TradeSummary } from "@/lib/tradesTypes";

export function formatTradeGbp(n: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function TwoWayTradeArrow() {
  return (
    <div className="flex shrink-0 items-center justify-center text-[var(--foreground)]/50" aria-hidden>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-11 w-11"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 12H16M11 9 8 12l3 3M13 9l3 3-3 3"
        />
      </svg>
    </div>
  );
}

function TradeHalfThumbnails({
  lines,
  entryForLine,
  thumbClassName,
}: {
  lines: TradeLineRow[];
  entryForLine: (line: TradeLineRow) => StorefrontCardEntry | undefined;
  thumbClassName: string;
}) {
  if (lines.length === 0) {
    return (
      <div className="flex min-h-[4.5rem] items-center justify-center rounded-md border border-dashed border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-2">
        <span className="text-xs text-[var(--foreground)]/40">—</span>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-center overflow-x-auto pb-1 scrollbar-hide">
      <ul className="flex w-max gap-2" role="list">
        {lines.map((line) => {
          const e = entryForLine(line);
          const src = e?.lowSrc || e?.src;
          const name = e?.cardName?.trim() || "Card";
          const cond = e?.conditionLabel ? ` · ${e.conditionLabel}` : "";
          const title = `${name}${cond} · ×${line.quantity}`;
          return (
            <li key={line.id} className={`flex ${thumbClassName} shrink-0 flex-col items-center`}>
              <div className="relative aspect-[63/88] w-full overflow-hidden rounded border border-[var(--foreground)]/12 bg-[var(--foreground)]/8">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote card art URLs
                  <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] text-[var(--foreground)]/35">
                    ?
                  </div>
                )}
                <span
                  className="absolute right-px top-px rounded bg-[var(--background)]/90 px-0.5 text-[9px] font-medium leading-none tabular-nums text-[var(--foreground)]"
                  title={title}
                >
                  ×{line.quantity}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SharedTradeHorizontalPreview({
  trade,
  viewerIdNum,
  viewerByLineId,
  counterpartyByLineId,
  counterpartyDisplayName,
  thumbClassName = "w-9",
}: {
  trade: TradeSummary;
  viewerIdNum: number;
  viewerByLineId: Map<string, StorefrontCardEntry>;
  counterpartyByLineId: Map<string, StorefrontCardEntry>;
  counterpartyDisplayName: string;
  thumbClassName?: string;
}) {
  const initiatorMap =
    trade.initiatorCustomerId === viewerIdNum ? viewerByLineId : counterpartyByLineId;
  const counterpartyMap =
    trade.initiatorCustomerId === viewerIdNum ? counterpartyByLineId : viewerByLineId;

  const isViewerInitiator = trade.initiatorCustomerId === viewerIdNum;

  const youOfferLines = trade.lines.filter((line) =>
    isViewerInitiator ? line.lineRole === "initiator_offers" : line.lineRole === "initiator_requests",
  );
  const youReceiveLines = trade.lines.filter((line) =>
    isViewerInitiator ? line.lineRole === "initiator_requests" : line.lineRole === "initiator_offers",
  );

  const entryForLine = (line: TradeLineRow) => {
    const entryMap = line.lineRole === "initiator_offers" ? initiatorMap : counterpartyMap;
    return entryMap.get(line.customerCollectionId);
  };

  const im = trade.initiatorMoneyGbp ?? 0;
  const cm = trade.counterpartyMoneyGbp ?? 0;
  const youCash = isViewerInitiator ? im : cm;
  const theyCash = isViewerInitiator ? cm : im;

  const theyShort =
    counterpartyDisplayName.trim().split(/\s+/)[0] ?? "They";

  return (
    <div className="mt-3" aria-label="Trade contents">
      <div className="flex gap-2">
        <div className="min-w-0 flex-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">You offer</p>
          <div className="mt-2">
            <TradeHalfThumbnails
              lines={youOfferLines}
              entryForLine={entryForLine}
              thumbClassName={thumbClassName}
            />
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[var(--foreground)]/70 tabular-nums">
            {youCash > 0 ? (
              <>You add {formatTradeGbp(youCash)}</>
            ) : (
              <span className="text-[var(--foreground)]/45">No cash</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center self-stretch px-1">
          <TwoWayTradeArrow />
        </div>

        <div className="min-w-0 flex-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">You receive</p>
          <div className="mt-2">
            <TradeHalfThumbnails
              lines={youReceiveLines}
              entryForLine={entryForLine}
              thumbClassName={thumbClassName}
            />
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[var(--foreground)]/70 tabular-nums">
            {theyCash > 0 ? (
              <>
                {theyShort} adds {formatTradeGbp(theyCash)}
              </>
            ) : (
              <span className="text-[var(--foreground)]/45">No cash</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
