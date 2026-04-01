"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { CollectCardGridWithTags } from "@/components/CollectCardGridWithTags";
import {
  collectionGroupKeyFromEntry,
  type CollectionLineSummary,
  type StorefrontCardEntry,
  type StorefrontCardExtras,
} from "@/lib/storefrontCardMaps";
import type { TradeLinePayload, TradeSummary } from "@/lib/tradesTypes";

type TradeGridCard = CardEntry & Pick<StorefrontCardExtras, "addedAt">;

export type NewTradeWizardClientProps = {
  shareId: string;
  counterpartyDisplayName: string;
  viewerCollectionEntries: StorefrontCardEntry[];
  counterpartyCollectionEntries: StorefrontCardEntry[];
  setLogosByCode: Record<string, string>;
  setSymbolsByCode: Record<string, string>;
  itemConditions: { id: string; name: string }[];
  viewerTradeGridCards: TradeGridCard[];
  viewerTradeCardPricesByMasterCardId: Record<string, number>;
  viewerTradeCollectionLinesByMasterCardId: Record<string, CollectionLineSummary[]>;
  viewerTradeManualPriceMasterCardIds: string[];
  viewerTradeGradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
  counterpartyTradeGridCards: TradeGridCard[];
  counterpartyTradeCardPricesByMasterCardId: Record<string, number>;
  counterpartyTradeCollectionLinesByMasterCardId: Record<string, CollectionLineSummary[]>;
  counterpartyTradeManualPriceMasterCardIds: string[];
  counterpartyTradeGradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
  viewerCustomerId: string;
  /** When set, wizard pre-fills from this trade and submits a counter-offer instead of creating a new trade. */
  amendTradeId?: string | null;
};

function formatGbp(n: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function buildLinesFromSelections(
  requestQty: Record<string, number>,
  offerQty: Record<string, number>,
): TradeLinePayload[] {
  const lines: TradeLinePayload[] = [];
  for (const [id, qty] of Object.entries(requestQty)) {
    if (qty > 0) lines.push({ lineRole: "initiator_requests", customerCollectionId: id, quantity: qty });
  }
  for (const [id, qty] of Object.entries(offerQty)) {
    if (qty > 0) lines.push({ lineRole: "initiator_offers", customerCollectionId: id, quantity: qty });
  }
  return lines;
}

function sumCardsValue(
  qtyMap: Record<string, number>,
  byLineId: Map<string, StorefrontCardEntry>,
  prices: Record<string, number>,
): number {
  let total = 0;
  for (const [entryId, qty] of Object.entries(qtyMap)) {
    if (qty <= 0) continue;
    const e = byLineId.get(entryId);
    if (!e) continue;
    const gk = collectionGroupKeyFromEntry(e);
    const unit = prices[gk] ?? 0;
    total += unit * qty;
  }
  return total;
}

function tradeLinesToQtyMaps(trade: TradeSummary): {
  requestQty: Record<string, number>;
  offerQty: Record<string, number>;
} {
  const requestQty: Record<string, number> = {};
  const offerQty: Record<string, number> = {};
  for (const line of trade.lines) {
    if (line.lineRole === "initiator_requests") {
      requestQty[line.customerCollectionId] = line.quantity;
    } else {
      offerQty[line.customerCollectionId] = line.quantity;
    }
  }
  return { requestQty, offerQty };
}

function cycleQtySetter(
  setMap: React.Dispatch<React.SetStateAction<Record<string, number>>>,
): (entryId: string, _card: CardEntry, maxQty: number) => void {
  return (entryId, _card, maxQty) => {
    const cap = Math.max(1, Math.floor(maxQty));
    setMap((prev) => {
      const cur = prev[entryId] ?? 0;
      const next = cur >= cap ? 0 : cur + 1;
      if (next === 0) {
        const { [entryId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [entryId]: next };
    });
  };
}

export function NewTradeWizardClient({
  shareId,
  counterpartyDisplayName,
  viewerCollectionEntries,
  counterpartyCollectionEntries,
  setLogosByCode,
  setSymbolsByCode,
  itemConditions,
  viewerTradeGridCards,
  viewerTradeCardPricesByMasterCardId,
  viewerTradeCollectionLinesByMasterCardId,
  viewerTradeManualPriceMasterCardIds,
  viewerTradeGradingByMasterCardId,
  counterpartyTradeGridCards,
  counterpartyTradeCardPricesByMasterCardId,
  counterpartyTradeCollectionLinesByMasterCardId,
  counterpartyTradeManualPriceMasterCardIds,
  counterpartyTradeGradingByMasterCardId,
  viewerCustomerId,
  amendTradeId = null,
}: NewTradeWizardClientProps) {
  const router = useRouter();
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [requestQtyByEntryId, setRequestQtyByEntryId] = useState<Record<string, number>>({});
  const [offerQtyByEntryId, setOfferQtyByEntryId] = useState<Record<string, number>>({});
  const [draftInitiatorMoney, setDraftInitiatorMoney] = useState("");
  const [draftCounterpartyMoney, setDraftCounterpartyMoney] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amendTrade, setAmendTrade] = useState<TradeSummary | null>(null);
  const [amendLoadState, setAmendLoadState] = useState<"idle" | "loading" | "ready" | "error">(
    amendTradeId ? "loading" : "ready",
  );

  const viewerTradeManualSet = useMemo(
    () => new Set(viewerTradeManualPriceMasterCardIds),
    [viewerTradeManualPriceMasterCardIds],
  );
  const counterpartyTradeManualSet = useMemo(
    () => new Set(counterpartyTradeManualPriceMasterCardIds),
    [counterpartyTradeManualPriceMasterCardIds],
  );

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

  useEffect(() => {
    if (!amendTradeId) {
      setAmendLoadState("ready");
      return;
    }
    let cancelled = false;
    setAmendLoadState("loading");
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/trades/${encodeURIComponent(amendTradeId)}`, { credentials: "include" });
        const json = (await res.json()) as { trade?: TradeSummary; error?: string };
        if (cancelled) return;
        if (!res.ok || !json.trade) {
          setError(json.error ?? "Could not load trade to amend");
          setAmendLoadState("error");
          return;
        }
        const t = json.trade;
        if (t.shareId !== shareId) {
          setError("This trade does not belong to this share.");
          setAmendLoadState("error");
          return;
        }
        if (t.status !== "offered") {
          setError("You can only amend an open offer.");
          setAmendLoadState("error");
          return;
        }
        setAmendTrade(t);
        const { requestQty, offerQty } = tradeLinesToQtyMaps(t);
        setRequestQtyByEntryId(requestQty);
        setOfferQtyByEntryId(offerQty);
        setDraftInitiatorMoney(t.initiatorMoneyGbp != null ? String(t.initiatorMoneyGbp) : "");
        setDraftCounterpartyMoney(t.counterpartyMoneyGbp != null ? String(t.counterpartyMoneyGbp) : "");
        setAmendLoadState("ready");
      } catch {
        if (!cancelled) {
          setError("Could not load trade to amend");
          setAmendLoadState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amendTradeId, shareId]);

  const swappedWizard = useMemo(() => {
    if (!amendTradeId || !amendTrade) return false;
    return amendTrade.initiatorCustomerId !== Number.parseInt(viewerCustomerId, 10);
  }, [amendTradeId, amendTrade, viewerCustomerId]);

  const parseMoney = (raw: string): number | null => {
    const t = raw.trim();
    if (!t) return null;
    const n = Number.parseFloat(t.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  const patchTrade = async (tradeId: string, body: Record<string, unknown>): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`/api/trades/${encodeURIComponent(tradeId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { trade?: unknown; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Request failed");
        return false;
      }
      return true;
    } catch {
      setError("Request failed");
      return false;
    }
  };

  const goToTradeTab = useCallback(() => {
    router.push(`/collect/shared/${encodeURIComponent(shareId)}?tab=trade`);
  }, [router, shareId]);

  const submitAmendedOffer = async () => {
    if (!amendTradeId) return;
    const lines = buildLinesFromSelections(requestQtyByEntryId, offerQtyByEntryId);
    if (!lines.length) {
      setError("Select at least one card line.");
      return;
    }
    const hasRequests = Object.values(requestQtyByEntryId).some((q) => q > 0);
    const hasOffers = Object.values(offerQtyByEntryId).some((q) => q > 0);
    if (!hasRequests || !hasOffers) {
      setError("Select cards to request and cards to offer before submitting.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await patchTrade(amendTradeId, {
      action: "counter",
      lines,
      initiatorMoneyGbp: parseMoney(draftInitiatorMoney),
      counterpartyMoneyGbp: parseMoney(draftCounterpartyMoney),
    });
    if (ok) goToTradeTab();
    setBusy(false);
  };

  const createTrade = async (mode: "draft" | "offer") => {
    if (amendTradeId) return;
    const lines = buildLinesFromSelections(requestQtyByEntryId, offerQtyByEntryId);
    if (!lines.length) {
      setError("Select at least one card line.");
      return;
    }
    if (mode === "offer") {
      const hasRequests = Object.values(requestQtyByEntryId).some((q) => q > 0);
      const hasOffers = Object.values(offerQtyByEntryId).some((q) => q > 0);
      if (!hasRequests || !hasOffers) {
        setError("Select cards to request and cards to offer before sending an offer.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareId,
          lines,
          initiatorMoneyGbp: parseMoney(draftInitiatorMoney),
          counterpartyMoneyGbp: parseMoney(draftCounterpartyMoney),
        }),
      });
      const json = (await res.json()) as { trade?: { id?: string }; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not create trade");
        return;
      }
      const id = json.trade?.id;
      if (mode === "offer" && id) {
        const patched = await patchTrade(id, {
          action: "send_offer",
          lines,
          initiatorMoneyGbp: parseMoney(draftInitiatorMoney),
          counterpartyMoneyGbp: parseMoney(draftCounterpartyMoney),
        });
        if (!patched) return;
      }
      goToTradeTab();
    } finally {
      setBusy(false);
    }
  };

  const onToggleRequest = useMemo(() => cycleQtySetter(setRequestQtyByEntryId), []);
  const onToggleOffer = useMemo(() => cycleQtySetter(setOfferQtyByEntryId), []);

  const receiveSummaryCards = useMemo(() => {
    const qtyMap = swappedWizard ? offerQtyByEntryId : requestQtyByEntryId;
    return counterpartyTradeGridCards
      .filter((c) => c.collectionEntryId && (qtyMap[c.collectionEntryId] ?? 0) > 0)
      .map((c) => ({
        ...c,
        quantity: qtyMap[c.collectionEntryId!]!,
      }));
  }, [counterpartyTradeGridCards, requestQtyByEntryId, offerQtyByEntryId, swappedWizard]);

  const offerSummaryCards = useMemo(() => {
    const qtyMap = swappedWizard ? requestQtyByEntryId : offerQtyByEntryId;
    return viewerTradeGridCards
      .filter((c) => c.collectionEntryId && (qtyMap[c.collectionEntryId] ?? 0) > 0)
      .map((c) => ({
        ...c,
        quantity: qtyMap[c.collectionEntryId!]!,
      }));
  }, [viewerTradeGridCards, requestQtyByEntryId, offerQtyByEntryId, swappedWizard]);

  const cardValueReceive = useMemo(
    () =>
      sumCardsValue(
        swappedWizard ? offerQtyByEntryId : requestQtyByEntryId,
        counterpartyByLineId,
        counterpartyTradeCardPricesByMasterCardId,
      ),
    [
      swappedWizard,
      requestQtyByEntryId,
      offerQtyByEntryId,
      counterpartyByLineId,
      counterpartyTradeCardPricesByMasterCardId,
    ],
  );
  const cardValueOffer = useMemo(
    () =>
      sumCardsValue(
        swappedWizard ? requestQtyByEntryId : offerQtyByEntryId,
        viewerByLineId,
        viewerTradeCardPricesByMasterCardId,
      ),
    [swappedWizard, requestQtyByEntryId, offerQtyByEntryId, viewerByLineId, viewerTradeCardPricesByMasterCardId],
  );

  const initiatorMoneyNum = parseMoney(draftInitiatorMoney) ?? 0;
  const counterpartyMoneyNum = parseMoney(draftCounterpartyMoney) ?? 0;
  const youGiveTotal = cardValueOffer + initiatorMoneyNum;
  const youReceiveTotal = cardValueReceive + counterpartyMoneyNum;
  const balanceDelta = youGiveTotal - youReceiveTotal;

  const hasRequestSelection = Object.values(requestQtyByEntryId).some((q) => q > 0);
  const hasOfferSelection = Object.values(offerQtyByEntryId).some((q) => q > 0);

  const backHref = amendTradeId
    ? `/collect/shared/${encodeURIComponent(shareId)}/trade/${encodeURIComponent(amendTradeId)}`
    : `/collect/shared/${encodeURIComponent(shareId)}?tab=trade`;

  const headerBtnClass =
    "inline-flex items-center justify-center rounded-md border border-[var(--foreground)]/25 bg-[var(--background)] px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--foreground)]/8";
  const headerBtnPrimaryClass =
    "inline-flex items-center justify-center rounded-md border border-[var(--foreground)]/30 bg-[var(--foreground)]/12 px-3 py-1.5 text-sm font-semibold transition hover:bg-[var(--foreground)]/18 disabled:cursor-not-allowed disabled:border-[var(--foreground)]/20 disabled:bg-[var(--foreground)]/8 disabled:text-[var(--foreground)]/45";

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="shrink-0 border-b border-[var(--foreground)]/10 px-4 pb-4 pt-2">
        <Link
          href={backHref}
          className="text-sm font-medium text-[var(--foreground)]/65 transition hover:text-[var(--foreground)]"
        >
          {amendTradeId ? "← Trade offer" : `← Trade with ${counterpartyDisplayName}`}
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h1 className="min-w-0 flex-1 pr-1">
            <span className="block text-xl font-semibold leading-tight">{amendTradeId ? "Amend trade" : "New trade"}</span>
            <span className="mt-1 block text-xs font-normal text-[var(--foreground)]/50">Step {wizardStep} of 3</span>
          </h1>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Link href={backHref} className={headerBtnClass}>
              Cancel
            </Link>
            {wizardStep > 1 ? (
              <button
                type="button"
                onClick={() => setWizardStep(wizardStep === 3 ? 2 : 1)}
                className={headerBtnClass}
              >
                Previous
              </button>
            ) : null}
            {wizardStep < 3 ? (
              <button
                type="button"
                disabled={
                  amendLoadState !== "ready" ||
                  (wizardStep === 1 ? !hasRequestSelection : !hasOfferSelection)
                }
                title={
                  wizardStep === 1 && !hasRequestSelection
                    ? "Select at least one card to request"
                    : wizardStep === 2 && !hasOfferSelection
                      ? "Select at least one card to offer"
                      : undefined
                }
                onClick={() => setWizardStep(wizardStep === 1 ? 2 : 3)}
                className={headerBtnPrimaryClass}
              >
                Next
              </button>
            ) : null}
            {wizardStep === 3 ? (
              <>
                {!amendTradeId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void createTrade("draft")}
                    className={headerBtnClass}
                  >
                    Save draft
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy || amendLoadState !== "ready"}
                  onClick={() => void (amendTradeId ? submitAmendedOffer() : createTrade("offer"))}
                  className={headerBtnPrimaryClass}
                >
                  {amendTradeId ? "Submit amended offer" : "Offer trade"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-[var(--bottom-nav-offset)] pt-4">
        {error ? (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {amendTradeId && amendLoadState === "loading" ? (
          <p className="text-sm text-[var(--foreground)]/60">Loading trade…</p>
        ) : null}

        {(!amendTradeId || amendLoadState === "ready") && wizardStep === 1 ? (
          <>
            <p className="text-xs text-[var(--foreground)]/65">
              {swappedWizard ? (
                <>
                  Tap <strong>your</strong> cards you are trading (lines the other party requested). Tap again to
                  increase quantity or clear.
                </>
              ) : (
                <>
                  Tap cards to choose how many copies you want from {counterpartyDisplayName}&apos;s collection. Tap
                  again to increase or clear.
                </>
              )}
            </p>
            {swappedWizard ? (
              viewerTradeGridCards.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--foreground)]/60">Your collection is empty — nothing to offer.</p>
              ) : (
                <div className="mt-4 -mx-4">
                  <CollectCardGridWithTags
                    cards={viewerTradeGridCards}
                    setLogosByCode={setLogosByCode}
                    setSymbolsByCode={setSymbolsByCode}
                    variant="collection"
                    itemConditions={itemConditions}
                    wishlistEntryIdsByMasterCardId={{}}
                    collectionLinesByMasterCardId={viewerTradeCollectionLinesByMasterCardId}
                    cardPricesByMasterCardId={viewerTradeCardPricesByMasterCardId}
                    manualPriceMasterCardIds={viewerTradeManualSet}
                    gradingByMasterCardId={viewerTradeGradingByMasterCardId}
                    readOnly
                    collectionSectionTitle="Your collection"
                    tradePickMode
                    tradeSelectedQtyByEntryId={requestQtyByEntryId}
                    onTradePickEntry={onToggleRequest}
                  />
                </div>
              )
            ) : counterpartyTradeGridCards.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--foreground)]/60">Their collection has no cards to request.</p>
            ) : (
              <div className="mt-4 -mx-4">
                <CollectCardGridWithTags
                  cards={counterpartyTradeGridCards}
                  setLogosByCode={setLogosByCode}
                  setSymbolsByCode={setSymbolsByCode}
                  variant="collection"
                  itemConditions={itemConditions}
                  wishlistEntryIdsByMasterCardId={{}}
                  collectionLinesByMasterCardId={counterpartyTradeCollectionLinesByMasterCardId}
                  cardPricesByMasterCardId={counterpartyTradeCardPricesByMasterCardId}
                  manualPriceMasterCardIds={counterpartyTradeManualSet}
                  gradingByMasterCardId={counterpartyTradeGradingByMasterCardId}
                  readOnly
                  collectionSectionTitle={`${counterpartyDisplayName}'s collection`}
                  tradePickMode
                  tradeSelectedQtyByEntryId={requestQtyByEntryId}
                  onTradePickEntry={onToggleRequest}
                />
              </div>
            )}
          </>
        ) : null}

        {(!amendTradeId || amendLoadState === "ready") && wizardStep === 2 ? (
          <>
            <p className="text-xs text-[var(--foreground)]/65">
              {swappedWizard ? (
                <>
                  Tap cards you want from <strong>{counterpartyDisplayName}</strong>&apos;s collection. Tap again to
                  increase or clear.
                </>
              ) : (
                <>
                  Tap cards in your collection to offer. Tap again to increase or clear.
                </>
              )}
            </p>
            {swappedWizard ? (
              counterpartyTradeGridCards.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--foreground)]/60">Their collection has no cards to request.</p>
              ) : (
                <div className="mt-4 -mx-4">
                  <CollectCardGridWithTags
                    cards={counterpartyTradeGridCards}
                    setLogosByCode={setLogosByCode}
                    setSymbolsByCode={setSymbolsByCode}
                    variant="collection"
                    itemConditions={itemConditions}
                    wishlistEntryIdsByMasterCardId={{}}
                    collectionLinesByMasterCardId={counterpartyTradeCollectionLinesByMasterCardId}
                    cardPricesByMasterCardId={counterpartyTradeCardPricesByMasterCardId}
                    manualPriceMasterCardIds={counterpartyTradeManualSet}
                    gradingByMasterCardId={counterpartyTradeGradingByMasterCardId}
                    readOnly
                    collectionSectionTitle={`${counterpartyDisplayName}'s collection`}
                    tradePickMode
                    tradeSelectedQtyByEntryId={offerQtyByEntryId}
                    onTradePickEntry={onToggleOffer}
                  />
                </div>
              )
            ) : viewerTradeGridCards.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--foreground)]/60">Your collection is empty — nothing to offer.</p>
            ) : (
              <div className="mt-4 -mx-4">
                <CollectCardGridWithTags
                  cards={viewerTradeGridCards}
                  setLogosByCode={setLogosByCode}
                  setSymbolsByCode={setSymbolsByCode}
                  variant="collection"
                  itemConditions={itemConditions}
                  wishlistEntryIdsByMasterCardId={{}}
                  collectionLinesByMasterCardId={viewerTradeCollectionLinesByMasterCardId}
                  cardPricesByMasterCardId={viewerTradeCardPricesByMasterCardId}
                  manualPriceMasterCardIds={viewerTradeManualSet}
                  gradingByMasterCardId={viewerTradeGradingByMasterCardId}
                  readOnly
                  collectionSectionTitle="Your collection"
                  tradePickMode
                  tradeSelectedQtyByEntryId={offerQtyByEntryId}
                  onTradePickEntry={onToggleOffer}
                />
              </div>
            )}
          </>
        ) : null}

        {(!amendTradeId || amendLoadState === "ready") && wizardStep === 3 ? (
          <>
            <p className="text-xs text-[var(--foreground)]/65">
              Review both sides. Values use app estimates plus any cash you add (informational, GBP). Adjust cash to see
              how close the trade is in value.
            </p>

            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-[var(--foreground)]/12 bg-[var(--background)] p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/55">You receive</h3>
                <p className="mt-1 text-xs text-[var(--foreground)]/50">From {counterpartyDisplayName}</p>
                {receiveSummaryCards.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--foreground)]/55">No cards selected.</p>
                ) : (
                  <div className="mt-3 -mx-1">
                    <CardGrid
                      cards={receiveSummaryCards}
                      setLogosByCode={setLogosByCode}
                      setSymbolsByCode={setSymbolsByCode}
                      variant="collection"
                      customerLoggedIn
                      readOnly
                      collectionLinesByMasterCardId={counterpartyTradeCollectionLinesByMasterCardId}
                      cardPricesByMasterCardId={counterpartyTradeCardPricesByMasterCardId}
                      manualPriceMasterCardIds={counterpartyTradeManualSet}
                      gradingByMasterCardId={counterpartyTradeGradingByMasterCardId}
                    />
                  </div>
                )}
                <label className="mt-3 block text-xs font-medium text-[var(--foreground)]/70">
                  They add (cash)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draftCounterpartyMoney}
                    onChange={(e) => setDraftCounterpartyMoney(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-sm"
                  />
                </label>
                <p className="mt-2 text-sm tabular-nums text-[var(--foreground)]/85">
                  Subtotal (cards): {formatGbp(cardValueReceive)}
                </p>
                <p className="text-sm font-medium tabular-nums text-[var(--foreground)]">
                  Total with cash: {formatGbp(youReceiveTotal)}
                </p>
              </section>

              <section className="rounded-lg border border-[var(--foreground)]/12 bg-[var(--background)] p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/55">You offer</h3>
                <p className="mt-1 text-xs text-[var(--foreground)]/50">From your binder</p>
                {offerSummaryCards.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--foreground)]/55">No cards selected.</p>
                ) : (
                  <div className="mt-3 -mx-1">
                    <CardGrid
                      cards={offerSummaryCards}
                      setLogosByCode={setLogosByCode}
                      setSymbolsByCode={setSymbolsByCode}
                      variant="collection"
                      customerLoggedIn
                      readOnly
                      collectionLinesByMasterCardId={viewerTradeCollectionLinesByMasterCardId}
                      cardPricesByMasterCardId={viewerTradeCardPricesByMasterCardId}
                      manualPriceMasterCardIds={viewerTradeManualSet}
                      gradingByMasterCardId={viewerTradeGradingByMasterCardId}
                    />
                  </div>
                )}
                <label className="mt-3 block text-xs font-medium text-[var(--foreground)]/70">
                  You add (cash)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draftInitiatorMoney}
                    onChange={(e) => setDraftInitiatorMoney(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-sm"
                  />
                </label>
                <p className="mt-2 text-sm tabular-nums text-[var(--foreground)]/85">
                  Subtotal (cards): {formatGbp(cardValueOffer)}
                </p>
                <p className="text-sm font-medium tabular-nums text-[var(--foreground)]">
                  Total with cash: {formatGbp(youGiveTotal)}
                </p>
              </section>
            </div>

            <div className="mt-4 rounded-lg border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/55">Trade balance</p>
              <p className="mt-2 text-sm leading-snug text-[var(--foreground)]/85">
                {Math.abs(balanceDelta) < 0.01 ? (
                  <span className="text-emerald-500">Both sides match (by estimates).</span>
                ) : balanceDelta > 0 ? (
                  <>
                    You&apos;re offering <strong className="tabular-nums">{formatGbp(balanceDelta)}</strong> more in value
                    than you&apos;re asking for.
                  </>
                ) : (
                  <>
                    You&apos;re asking for <strong className="tabular-nums">{formatGbp(-balanceDelta)}</strong> more in value
                    than you&apos;re offering.
                  </>
                )}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
