export type TradeStatus = "draft" | "offered" | "accepted" | "completed" | "declined";

export type TradeLineRole = "initiator_offers" | "initiator_requests";

export type TradeLinePayload = {
  lineRole: TradeLineRole;
  customerCollectionId: string;
  quantity: number;
};

export type TradeSummary = {
  id: string;
  shareId: string;
  initiatorCustomerId: number;
  counterpartyCustomerId: number;
  status: TradeStatus;
  revision: number;
  initiatorAgreedRevision: number;
  counterpartyAgreedRevision: number;
  initiatorMoneyGbp: number | null;
  counterpartyMoneyGbp: number | null;
  initiatorExchangeConfirmedAt: string | null;
  counterpartyExchangeConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: TradeLineRow[];
};

export type TradeLineRow = {
  id: string;
  tradeId: string;
  revision: number;
  lineRole: TradeLineRole;
  customerCollectionId: string;
  quantity: number;
};
