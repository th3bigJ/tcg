"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CollectGridSealedRow } from "@/lib/collectGridSealed";

export function CollectGridSealedTile({
  row,
  variant,
  visualIndex,
}: {
  row: CollectGridSealedRow;
  variant: "collection" | "wishlist";
  visualIndex: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const showWishlistHeart = variant === "wishlist";
  const showQty = variant === "collection" && row.totalQuantity > 1;
  const canMarkOpened =
    variant === "collection" && row.sealedEntryIds.length > 0 && row.sealedQuantity >= 1;
  const nextSealedEntryId = row.sealedEntryIds[0] ?? "";

  async function markSealedLineOpened() {
    if (!nextSealedEntryId) return;
    setPending(true);
    try {
      const res = await fetch("/api/sealed-collection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: nextSealedEntryId, sealedState: "opened" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(typeof j.error === "string" ? j.error : "Could not mark as opened.");
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="card-grid-item flex flex-col">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {row.imageUrl ? (
            <img
              src={row.imageUrl}
              alt=""
              className="h-full w-full object-cover object-center"
              loading={visualIndex < 12 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={visualIndex < 6 ? "high" : "auto"}
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white text-[10px] text-[var(--foreground)]/40">
              No image
            </div>
          )}
        </div>
        {showWishlistHeart ? (
          <span
            className="pointer-events-none absolute z-20 flex h-6 w-6 items-center justify-center rounded-full"
            style={{
              background: "#ef4444",
              bottom: "6px",
              right: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.28)",
              outline: "2px solid var(--background)",
            }}
            title="On your wishlist"
            aria-hidden
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white" aria-hidden>
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
            </svg>
          </span>
        ) : null}
        {canMarkOpened ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            className="absolute bottom-1.5 left-1.5 z-30 max-w-[calc(100%-12px)] rounded-md border border-[var(--foreground)]/20 bg-[var(--background)]/92 px-2 py-1 text-[9px] font-semibold leading-tight text-[var(--foreground)] shadow-sm backdrop-blur-sm transition hover:bg-[var(--background)]"
          >
            Mark opened
          </button>
        ) : null}
        <Link
          href={`/sealed/${row.sealedProductId}`}
          className="absolute inset-0 z-10"
          aria-label={`View ${row.name}`}
        />
      </div>
      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="presentation"
          onClick={() => !pending && setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sealed-opened-confirm-title"
            className="w-full max-w-sm rounded-2xl border border-[var(--foreground)]/14 bg-[var(--background)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="sealed-opened-confirm-title" className="text-sm font-semibold text-[var(--foreground)]">
              Mark as opened?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[var(--foreground)]/65">
              Sets the linked purchase transaction to Opened (that is where sealed vs opened is stored).
              Your transactions summary treats that spend as Ripped.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-full border border-[var(--foreground)]/22 bg-[var(--foreground)]/8 py-2.5 text-xs font-semibold text-[var(--foreground)]/85 transition hover:bg-[var(--foreground)]/12 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void markSealedLineOpened()}
                className="flex-1 rounded-full border border-[var(--foreground)]/25 bg-[var(--foreground)]/14 py-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--foreground)]/20 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="relative mt-1 min-h-[2.9rem]">
        {showQty ? (
          <span className="absolute left-0 top-0 inline-flex rounded bg-[var(--foreground)]/85 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[var(--background)]">
            ×{row.totalQuantity}
          </span>
        ) : null}
        <div className="min-w-0 w-full px-1 text-center">
          <span className="block line-clamp-1 text-[10px] font-medium text-[var(--foreground)]/85">{row.name}</span>
          {row.series ? (
            <span className="mt-0.5 block line-clamp-1 text-[10px] font-medium text-[var(--foreground)]/68">
              {row.series}
            </span>
          ) : null}
          <span className="mt-0.5 block text-[10px] font-medium tabular-nums text-[var(--foreground)]/70">
            {row.priceLabel ?? <span aria-hidden="true">&nbsp;</span>}
          </span>
          {variant === "collection" && (row.openedQuantity > 0 || row.sealedQuantity > 0) ? (
            <span className="mt-0.5 block text-[9px] font-medium text-[var(--foreground)]/52">
              {row.sealedQuantity > 0 ? `${row.sealedQuantity} sealed` : null}
              {row.sealedQuantity > 0 && row.openedQuantity > 0 ? " · " : null}
              {row.openedQuantity > 0 ? `${row.openedQuantity} opened` : null}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
