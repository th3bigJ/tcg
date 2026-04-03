"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type CollectionRemovalReason = "" | "lost" | "traded" | "sold" | "damaged" | "gifted" | "built_deck";

export type CollectionRemovalTradeItem =
  | {
      type: "card";
      tempId: string;
      masterCardId: string;
      cardSearchQuery: string;
      cardSearchResults: { id: string; cardName: string; setName: string }[];
      cardSearchLoading: boolean;
      quantity: number;
    }
  | { type: "sealed"; tempId: string; description: string; quantity: number };

export type CollectionRemovalConfirmPayload = {
  reason: Exclude<CollectionRemovalReason, "">;
  saleValue: string;
  tradeItems: CollectionRemovalTradeItem[];
};

type CollectionRemovalReasonSheetProps = {
  open: boolean;
  onClose: () => void;
  itemName: string;
  onConfirm: (payload: CollectionRemovalConfirmPayload) => void | Promise<void>;
  confirmPending: boolean;
  /** Backdrop + sheet z-index (use higher when opened above another full-screen modal). */
  overlayZIndexClass?: string;
};

export function CollectionRemovalReasonSheet({
  open,
  onClose,
  itemName,
  onConfirm,
  confirmPending,
  overlayZIndexClass = "z-[10001]",
}: CollectionRemovalReasonSheetProps) {
  const [removalReason, setRemovalReason] = useState<CollectionRemovalReason>("");
  const [removalSaleValue, setRemovalSaleValue] = useState("");
  const [removalTradeItems, setRemovalTradeItems] = useState<CollectionRemovalTradeItem[]>([]);

  useEffect(() => {
    if (open) {
      setRemovalReason("");
      setRemovalSaleValue("");
      setRemovalTradeItems([]);
    }
  }, [open]);

  const addTradeItem = useCallback((type: "card" | "sealed") => {
    const tempId = String(Date.now()) + String(Math.random());
    setRemovalTradeItems((prev) => [
      ...prev,
      type === "card"
        ? {
            type: "card",
            tempId,
            masterCardId: "",
            cardSearchQuery: "",
            cardSearchResults: [],
            cardSearchLoading: false,
            quantity: 1,
          }
        : { type: "sealed", tempId, description: "", quantity: 1 },
    ]);
  }, []);

  const removeTradeItem = useCallback((tempId: string) => {
    setRemovalTradeItems((prev) => prev.filter((i) => i.tempId !== tempId));
  }, []);

  const updateTradeItem = useCallback((tempId: string, patch: Partial<CollectionRemovalTradeItem>) => {
    setRemovalTradeItems((prev) =>
      prev.map((i) => (i.tempId === tempId ? ({ ...i, ...patch } as CollectionRemovalTradeItem) : i)),
    );
  }, []);

  const searchCardForTrade = useCallback(
    async (tempId: string, query: string) => {
      updateTradeItem(tempId, { cardSearchQuery: query, cardSearchLoading: true, cardSearchResults: [] });
      if (query.length < 2) {
        updateTradeItem(tempId, { cardSearchLoading: false });
        return;
      }
      try {
        const res = await fetch(`/api/cards/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = (await res.json()) as { docs?: { id: string; cardName: string; setName: string }[] };
          updateTradeItem(tempId, { cardSearchResults: data.docs ?? [], cardSearchLoading: false });
        } else {
          updateTradeItem(tempId, { cardSearchLoading: false });
        }
      } catch {
        updateTradeItem(tempId, { cardSearchLoading: false });
      }
    },
    [updateTradeItem],
  );

  const submit = useCallback(async () => {
    if (!removalReason) return;
    await onConfirm({
      reason: removalReason,
      saleValue: removalSaleValue,
      tradeItems: removalTradeItems,
    });
  }, [onConfirm, removalReason, removalSaleValue, removalTradeItems]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
      <div
        className={`fixed inset-0 flex flex-col justify-end bg-black/60 ${overlayZIndexClass}`}
        onClick={onClose}
        role="presentation"
      >
        <div
          className="max-h-[90dvh] overflow-y-auto rounded-t-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 text-[var(--foreground)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Remove from collection"
        >
          <h2 className="text-lg font-semibold">Remove from collection</h2>
          <p className="mt-1 text-sm text-[var(--foreground)]/65">{itemName}</p>

          <div className="mt-4 flex flex-col gap-1 text-sm">
            <span className="font-medium">Reason</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["lost", "sold", "traded", "damaged", "gifted", "built_deck"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRemovalReason(r)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                    removalReason === r
                      ? "border-[var(--foreground)]/50 bg-[var(--foreground)]/15"
                      : "border-[var(--foreground)]/20 bg-transparent opacity-60"
                  }`}
                >
                  {r === "built_deck" ? "Built deck" : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {removalReason === "sold" && (
            <div className="mt-4 flex flex-col gap-1 text-sm">
              <label className="font-medium" htmlFor="collection-removal-sale-value">
                Sale value (£)
              </label>
              <input
                id="collection-removal-sale-value"
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={removalSaleValue}
                onChange={(e) => setRemovalSaleValue(e.target.value)}
                className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2"
              />
            </div>
          )}

          {removalReason === "traded" && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Items received in trade</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => addTradeItem("card")}
                    className="rounded-md border border-[var(--foreground)]/20 bg-[var(--foreground)]/8 px-2.5 py-1 text-xs font-medium transition hover:bg-[var(--foreground)]/14"
                  >
                    + Card
                  </button>
                  <button
                    type="button"
                    onClick={() => addTradeItem("sealed")}
                    className="rounded-md border border-[var(--foreground)]/20 bg-[var(--foreground)]/8 px-2.5 py-1 text-xs font-medium transition hover:bg-[var(--foreground)]/14"
                  >
                    + Sealed
                  </button>
                </div>
              </div>

              {removalTradeItems.length === 0 && (
                <p className="text-xs text-[var(--foreground)]/45">Add the cards or sealed products you received.</p>
              )}

              {removalTradeItems.map((item) => (
                <div
                  key={item.tempId}
                  className="rounded-md border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/50">
                      {item.type === "card" ? "Card" : "Sealed product"}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeTradeItem(item.tempId)}
                      className="text-xs text-[var(--foreground)]/40 hover:text-[var(--foreground)]/70"
                    >
                      Remove
                    </button>
                  </div>

                  {item.type === "card" ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        placeholder="Search card name…"
                        value={item.cardSearchQuery}
                        onChange={(e) => void searchCardForTrade(item.tempId, e.target.value)}
                        className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-sm"
                      />
                      {item.cardSearchLoading && <p className="text-xs text-[var(--foreground)]/45">Searching…</p>}
                      {item.cardSearchResults.length > 0 && !item.masterCardId && (
                        <ul className="max-h-32 overflow-y-auto rounded-md border border-[var(--foreground)]/15 bg-[var(--background)]">
                          {item.cardSearchResults.map((r) => (
                            <li key={r.id}>
                              <button
                                type="button"
                                onClick={() =>
                                  updateTradeItem(item.tempId, {
                                    masterCardId: r.id,
                                    cardSearchQuery: `${r.cardName} — ${r.setName}`,
                                    cardSearchResults: [],
                                  })
                                }
                                className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--foreground)]/8"
                              >
                                <span className="font-medium">{String(r.cardName)}</span>
                                {r.setName ? (
                                  <span className="ml-1 text-[var(--foreground)]/50">— {String(r.setName)}</span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.masterCardId && (
                        <div className="flex items-center justify-between rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-sm">
                          <span className="text-green-400">{item.cardSearchQuery}</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateTradeItem(item.tempId, {
                                masterCardId: "",
                                cardSearchQuery: "",
                                cardSearchResults: [],
                              })
                            }
                            className="ml-2 text-xs text-[var(--foreground)]/40 hover:text-[var(--foreground)]/70"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--foreground)]/65">Qty</span>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateTradeItem(item.tempId, {
                              quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                          className="w-20 rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-1.5 text-sm"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Surging Sparks ETB"
                        value={item.description}
                        onChange={(e) => updateTradeItem(item.tempId, { description: e.target.value })}
                        className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-sm"
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <span className="text-[var(--foreground)]/65">Qty</span>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateTradeItem(item.tempId, {
                              quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                            })
                          }
                          className="w-20 rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-1.5 text-sm"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-[var(--foreground)]/25 px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={confirmPending || !removalReason}
              onClick={() => void submit()}
              className="flex-1 rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {confirmPending ? "Removing…" : "Confirm"}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
}
