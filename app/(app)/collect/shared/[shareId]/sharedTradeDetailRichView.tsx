"use client";

import { useMemo, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { formatTradeGbp } from "@/app/(app)/collect/shared/[shareId]/sharedTradeHorizontalPreview";
import { unitGbpForTradeLine } from "@/app/(app)/collect/shared/[shareId]/sharedTradeViewerTotals";
import type { CollectionLineSummary, StorefrontCardEntry } from "@/lib/storefrontCardMaps";
import type { TradeLineRow, TradeSummary } from "@/lib/tradesTypes";

function TwoWayTradeArrowLarge() {
  return (
    <div className="flex shrink-0 items-center justify-center py-1 text-[var(--foreground)]/45" aria-hidden>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-11 w-11 rotate-90"
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

function TradeSideDetail({
  title,
  lines,
  entryForLine,
  initiatorPrices,
  counterpartyPrices,
  cashGbp,
  cashLabel,
  onCardPreview,
}: {
  title: string;
  lines: TradeLineRow[];
  entryForLine: (line: TradeLineRow) => StorefrontCardEntry | undefined;
  initiatorPrices: Record<string, number>;
  counterpartyPrices: Record<string, number>;
  cashGbp: number;
  cashLabel: string;
  onCardPreview: (entry: StorefrontCardEntry) => void;
}) {
  let cardsSubtotal = 0;
  for (const line of lines) {
    const e = entryForLine(line);
    if (!e) continue;
    const unit = unitGbpForTradeLine(line, e, initiatorPrices, counterpartyPrices);
    cardsSubtotal += unit * line.quantity;
  }
  const total = cardsSubtotal + cashGbp;

  return (
    <div className="w-full text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">{title}</p>

      {lines.length === 0 ? (
        <div className="mt-3 flex min-h-[6rem] items-center justify-center rounded-lg border border-dashed border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-2">
          <span className="text-sm text-[var(--foreground)]/40">—</span>
        </div>
      ) : (
        <ul className="mt-3 space-y-4 text-left" role="list">
          {lines.map((line) => {
            const e = entryForLine(line);
            const src = e?.lowSrc || e?.src;
            const name = e?.cardName?.trim() || "Card";
            const cond = e?.conditionLabel ? e.conditionLabel : null;
            const unit = e ? unitGbpForTradeLine(line, e, initiatorPrices, counterpartyPrices) : 0;
            const lineTotal = unit * line.quantity;

            return (
              <li key={line.id}>
                <button
                  type="button"
                  onClick={() => e && onCardPreview(e)}
                  disabled={!e}
                  className="group flex w-full flex-col gap-3 rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-3 text-left transition hover:bg-[var(--foreground)]/8 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="relative mx-auto h-36 w-[7.75rem] shrink-0 overflow-hidden rounded-md border border-[var(--foreground)]/12 bg-[var(--foreground)]/8 sm:mx-0 sm:h-32 sm:w-[5.75rem]">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote card art URLs
                      <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--foreground)]/35">
                        ?
                      </div>
                    )}
                    <span className="absolute right-1 top-1 rounded bg-[var(--background)]/90 px-1 text-xs font-medium tabular-nums text-[var(--foreground)]">
                      ×{line.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 w-full flex-1 py-0.5 text-left sm:pt-1">
                    <p className="text-sm font-medium leading-snug text-[var(--foreground)] group-hover:underline">
                      {name}
                    </p>
                    {cond ? (
                      <p className="mt-0.5 text-xs text-[var(--foreground)]/60">{cond}</p>
                    ) : null}
                    <p className="mt-2 text-xs tabular-nums text-[var(--foreground)]/70">
                      {unit > 0 ? (
                        <>
                          {formatTradeGbp(unit)} each · {formatTradeGbp(lineTotal)} line total
                        </>
                      ) : (
                        <span className="text-[var(--foreground)]/50">Guide price unavailable</span>
                      )}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 space-y-1 border-t border-[var(--foreground)]/10 pt-3 text-xs tabular-nums text-[var(--foreground)]/75">
        <p>
          Cards subtotal: <span className="text-[var(--foreground)]">{formatTradeGbp(cardsSubtotal)}</span>
        </p>
        <p>
          {cashLabel}:{" "}
          <span className="text-[var(--foreground)]">{cashGbp > 0 ? formatTradeGbp(cashGbp) : "—"}</span>
        </p>
        <p className="text-sm font-medium text-[var(--foreground)]">
          Side total: {formatTradeGbp(total)}
        </p>
      </div>
    </div>
  );
}

export function SharedTradeDetailRichView({
  trade,
  viewerIdNum,
  viewerByLineId,
  counterpartyByLineId,
  counterpartyDisplayName,
  viewerPricesByGroupKey,
  counterpartyPricesByGroupKey,
  setLogosByCode,
  setSymbolsByCode,
  itemConditions,
  viewerTradeCollectionLinesByMasterCardId,
  counterpartyTradeCollectionLinesByMasterCardId,
  viewerTradeManualPriceMasterCardIds,
  counterpartyTradeManualPriceMasterCardIds,
  viewerTradeGradingByMasterCardId,
  counterpartyTradeGradingByMasterCardId,
}: {
  trade: TradeSummary;
  viewerIdNum: number;
  viewerByLineId: Map<string, StorefrontCardEntry>;
  counterpartyByLineId: Map<string, StorefrontCardEntry>;
  counterpartyDisplayName: string;
  viewerPricesByGroupKey: Record<string, number>;
  counterpartyPricesByGroupKey: Record<string, number>;
  setLogosByCode: Record<string, string>;
  setSymbolsByCode: Record<string, string>;
  itemConditions: { id: string; name: string }[];
  viewerTradeCollectionLinesByMasterCardId: Record<string, CollectionLineSummary[]>;
  counterpartyTradeCollectionLinesByMasterCardId: Record<string, CollectionLineSummary[]>;
  viewerTradeManualPriceMasterCardIds: string[];
  counterpartyTradeManualPriceMasterCardIds: string[];
  viewerTradeGradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
  counterpartyTradeGradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
}) {
  const [previewEntry, setPreviewEntry] = useState<StorefrontCardEntry | null>(null);

  const mergedCollectionLines = useMemo(() => {
    return {
      ...counterpartyTradeCollectionLinesByMasterCardId,
      ...viewerTradeCollectionLinesByMasterCardId,
    };
  }, [viewerTradeCollectionLinesByMasterCardId, counterpartyTradeCollectionLinesByMasterCardId]);

  const mergedCardPrices = useMemo(() => {
    return { ...counterpartyPricesByGroupKey, ...viewerPricesByGroupKey };
  }, [counterpartyPricesByGroupKey, viewerPricesByGroupKey]);

  const mergedManualIds = useMemo(() => {
    return new Set([...counterpartyTradeManualPriceMasterCardIds, ...viewerTradeManualPriceMasterCardIds]);
  }, [counterpartyTradeManualPriceMasterCardIds, viewerTradeManualPriceMasterCardIds]);

  const mergedGrading = useMemo(() => {
    return { ...counterpartyTradeGradingByMasterCardId, ...viewerTradeGradingByMasterCardId };
  }, [counterpartyTradeGradingByMasterCardId, viewerTradeGradingByMasterCardId]);

  const initiatorMap =
    trade.initiatorCustomerId === viewerIdNum ? viewerByLineId : counterpartyByLineId;
  const counterpartyMap =
    trade.initiatorCustomerId === viewerIdNum ? counterpartyByLineId : viewerByLineId;

  const initiatorPrices =
    trade.initiatorCustomerId === viewerIdNum ? viewerPricesByGroupKey : counterpartyPricesByGroupKey;
  const counterpartyPrices =
    trade.initiatorCustomerId === viewerIdNum ? counterpartyPricesByGroupKey : viewerPricesByGroupKey;

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

  const theyShort = counterpartyDisplayName.trim().split(/\s+/)[0] ?? "They";

  return (
    <div className="mt-4 space-y-2" aria-label="Trade details">
      <p className="text-center text-xs text-[var(--foreground)]/55">
        Guide prices are estimates. Tap a card to open details.
      </p>
      <div className="flex flex-col gap-6">
        <TradeSideDetail
          title="You offer"
          lines={youOfferLines}
          entryForLine={entryForLine}
          initiatorPrices={initiatorPrices}
          counterpartyPrices={counterpartyPrices}
          cashGbp={youCash}
          cashLabel="Cash you add"
          onCardPreview={setPreviewEntry}
        />
        <TwoWayTradeArrowLarge />
        <TradeSideDetail
          title="You receive"
          lines={youReceiveLines}
          entryForLine={entryForLine}
          initiatorPrices={initiatorPrices}
          counterpartyPrices={counterpartyPrices}
          cashGbp={theyCash}
          cashLabel={`Cash ${theyShort} adds`}
          onCardPreview={setPreviewEntry}
        />
      </div>

      {previewEntry ? (
        <CardGrid
          key={previewEntry.collectionEntryId ?? previewEntry.masterCardId ?? previewEntry.filename}
          hideGrid
          cards={[previewEntry as CardEntry]}
          setLogosByCode={setLogosByCode}
          setSymbolsByCode={setSymbolsByCode}
          variant="collection"
          customerLoggedIn
          readOnly
          itemConditions={itemConditions}
          wishlistEntryIdsByMasterCardId={{}}
          collectionLinesByMasterCardId={mergedCollectionLines}
          cardPricesByMasterCardId={mergedCardPrices}
          manualPriceMasterCardIds={mergedManualIds}
          gradingByMasterCardId={mergedGrading}
          onModalClose={() => setPreviewEntry(null)}
        />
      ) : null}
    </div>
  );
}
