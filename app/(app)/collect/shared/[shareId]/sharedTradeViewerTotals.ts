import { collectionGroupKeyFromEntry, type StorefrontCardEntry } from "@/lib/storefrontCardMaps";
import type { TradeLineRow, TradeSummary } from "@/lib/tradesTypes";

export function unitGbpForTradeLine(
  line: TradeLineRow,
  entry: StorefrontCardEntry,
  initiatorPrices: Record<string, number>,
  counterpartyPrices: Record<string, number>,
): number {
  const map = line.lineRole === "initiator_offers" ? initiatorPrices : counterpartyPrices;
  const gk = collectionGroupKeyFromEntry(entry);
  const v = map[gk];
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof entry.unlistedPrice === "number" && Number.isFinite(entry.unlistedPrice)) return entry.unlistedPrice;
  return 0;
}

export type ViewerTradeTotals = {
  youOfferCardGbp: number;
  youReceiveCardGbp: number;
  youCashGbp: number;
  theyCashGbp: number;
  youGiveTotalGbp: number;
  youReceiveTotalGbp: number;
  balanceGbp: number;
};

export function computeViewerTradeTotals(
  trade: TradeSummary,
  viewerIdNum: number,
  viewerByLineId: Map<string, StorefrontCardEntry>,
  counterpartyByLineId: Map<string, StorefrontCardEntry>,
  viewerPricesByGroupKey: Record<string, number>,
  counterpartyPricesByGroupKey: Record<string, number>,
): ViewerTradeTotals {
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

  let youOfferCardGbp = 0;
  for (const line of youOfferLines) {
    const e = entryForLine(line);
    if (!e) continue;
    youOfferCardGbp += unitGbpForTradeLine(line, e, initiatorPrices, counterpartyPrices) * line.quantity;
  }

  let youReceiveCardGbp = 0;
  for (const line of youReceiveLines) {
    const e = entryForLine(line);
    if (!e) continue;
    youReceiveCardGbp += unitGbpForTradeLine(line, e, initiatorPrices, counterpartyPrices) * line.quantity;
  }

  const im = trade.initiatorMoneyGbp ?? 0;
  const cm = trade.counterpartyMoneyGbp ?? 0;
  const youCashGbp = isViewerInitiator ? im : cm;
  const theyCashGbp = isViewerInitiator ? cm : im;

  const youGiveTotalGbp = youOfferCardGbp + youCashGbp;
  const youReceiveTotalGbp = youReceiveCardGbp + theyCashGbp;

  return {
    youOfferCardGbp,
    youReceiveCardGbp,
    youCashGbp,
    theyCashGbp,
    youGiveTotalGbp,
    youReceiveTotalGbp,
    balanceGbp: youGiveTotalGbp - youReceiveTotalGbp,
  };
}
