"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ShopSealedProduct } from "@/lib/r2SealedProducts";

type SealedProductDetailSidebarProps = {
  product: ShopSealedProduct;
  typeLabel: string;
  marketValueLabel: string;
  releaseLabel: string;
  ebayUrl: string | null;
  loggedIn: boolean;
  initialWishlistEntryId: string | null;
  /** Newest first (matches remove-one = LIFO) */
  initialCollectionEntryIds: string[];
  initialTotalQuantity: number;
};

export function SealedProductDetailSidebar({
  product,
  typeLabel,
  marketValueLabel,
  releaseLabel,
  ebayUrl,
  loggedIn,
  initialWishlistEntryId,
  initialCollectionEntryIds,
  initialTotalQuantity,
}: SealedProductDetailSidebarProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [wishlistEntryId, setWishlistEntryId] = useState<string | null>(initialWishlistEntryId);
  const [collectionEntryIds, setCollectionEntryIds] = useState<string[]>(initialCollectionEntryIds);
  const [totalQuantity, setTotalQuantity] = useState(initialTotalQuantity);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const [wishPending, setWishPending] = useState(false);
  const [addQuantity, setAddQuantity] = useState(1);
  const [addPurchaseType, setAddPurchaseType] = useState<"bought" | "traded">("bought");
  const [addPricePaid, setAddPricePaid] = useState("");
  /** Empty until first open — avoids server/client date mismatch at midnight boundaries. */
  const [addPurchaseDate, setAddPurchaseDate] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setWishlistEntryId(initialWishlistEntryId);
  }, [initialWishlistEntryId]);

  useEffect(() => {
    setCollectionEntryIds(initialCollectionEntryIds);
    setTotalQuantity(initialTotalQuantity);
  }, [initialCollectionEntryIds, initialTotalQuantity]);

  const submitAdd = useCallback(async () => {
    setAddPending(true);
    try {
      const qty = Math.max(1, Math.floor(addQuantity) || 1);
      const res = await fetch("/api/sealed-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sealedProductId: product.id,
          quantity: qty,
          purchaseType: addPurchaseType,
          pricePaid:
            addPurchaseType === "bought" && addPricePaid !== "" ? Number.parseFloat(addPricePaid) : undefined,
          purchaseDate: addPurchaseType === "bought" && addPurchaseDate ? addPurchaseDate : undefined,
        }),
      });
      const j = (await res.json()) as {
        docs?: { id?: string | number }[];
        removedWishlist?: boolean;
        error?: string;
      };
      if (!res.ok) {
        console.error("[sealed-collection add]", res.status, j.error);
        return;
      }
      const created = Array.isArray(j.docs)
        ? j.docs.map((d) => (d?.id != null ? String(d.id) : "")).filter(Boolean)
        : [];
      if (created.length > 0) {
        setCollectionEntryIds((prev) => [...created, ...prev]);
        setTotalQuantity((t) => t + qty);
      }
      if (j.removedWishlist) {
        setWishlistEntryId(null);
      }
      setAddSheetOpen(false);
      router.refresh();
    } catch {
      /* network */
    } finally {
      setAddPending(false);
    }
  }, [addPurchaseDate, addPurchaseType, addPricePaid, addQuantity, product.id, router]);

  const removeOneCopy = useCallback(async () => {
    const newest = collectionEntryIds[0];
    if (!newest) return;
    setAddPending(true);
    try {
      const res = await fetch(`/api/sealed-collection?id=${encodeURIComponent(newest)}`, { method: "DELETE" });
      if (!res.ok) return;
      setCollectionEntryIds((prev) => prev.slice(1));
      setTotalQuantity((t) => Math.max(0, t - 1));
      router.refresh();
    } finally {
      setAddPending(false);
    }
  }, [collectionEntryIds, router]);

  const toggleWishlist = useCallback(async () => {
    setWishPending(true);
    try {
      if (wishlistEntryId) {
        const res = await fetch(`/api/sealed-wishlist?id=${encodeURIComponent(wishlistEntryId)}`, {
          method: "DELETE",
        });
        if (!res.ok) return;
        setWishlistEntryId(null);
      } else {
        const res = await fetch("/api/sealed-wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sealedProductId: product.id }),
        });
        const j = (await res.json()) as { doc?: { id?: string | number }; error?: string };
        if (!res.ok) {
          console.error("[sealed-wishlist]", j.error);
          return;
        }
        const raw = j.doc?.id;
        if (raw !== undefined && raw !== null) setWishlistEntryId(String(raw));
      }
      router.refresh();
    } finally {
      setWishPending(false);
    }
  }, [product.id, router, wishlistEntryId]);

  const addSheet =
    addSheetOpen &&
    mounted &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 z-[10001] flex flex-col justify-end bg-black/60"
        onClick={() => setAddSheetOpen(false)}
        role="presentation"
      >
        <div
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))] pt-4 text-[var(--foreground)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Add sealed product to collection"
        >
          <h2 className="text-lg font-semibold">Add to collection</h2>
          <p className="mt-1 text-sm text-[var(--foreground)]/65">{product.name}</p>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddQuantity((q) => Math.max(1, Math.floor(q || 1) - 1))}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 text-lg font-semibold text-[var(--foreground)] transition hover:bg-[var(--foreground)]/20"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={addQuantity < 1 ? "" : addQuantity}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === "") {
                      setAddQuantity(0);
                      return;
                    }
                    const parsed = Number.parseInt(raw, 10);
                    if (Number.isFinite(parsed)) setAddQuantity(parsed);
                  }}
                  onBlur={() => setAddQuantity((q) => (Number.isFinite(q) && q >= 1 ? Math.floor(q) : 1))}
                  className="min-w-0 flex-1 rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-center"
                />
                <button
                  type="button"
                  onClick={() => setAddQuantity((q) => Math.max(1, Math.floor(q || 1) + 1))}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 text-lg font-semibold text-[var(--foreground)] transition hover:bg-[var(--foreground)]/20"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">How obtained</span>
              <div className="flex gap-2">
                {(["bought", "traded"] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAddPurchaseType(val)}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                      addPurchaseType === val
                        ? "border-[var(--foreground)]/50 bg-[var(--foreground)]/15"
                        : "border-[var(--foreground)]/20 bg-transparent opacity-60"
                    }`}
                  >
                    {val.charAt(0).toUpperCase() + val.slice(1)}
                  </button>
                ))}
              </div>
            </label>
            {addPurchaseType === "bought" && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Price paid (£)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={addPricePaid}
                    onChange={(e) => setAddPricePaid(e.target.value)}
                    className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Purchase date</span>
                  <input
                    type="date"
                    value={addPurchaseDate}
                    onChange={(e) => setAddPurchaseDate(e.target.value)}
                    className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2"
                  />
                </label>
              </>
            )}
            <button
              type="button"
              disabled={addPending}
              onClick={() => void submitAdd()}
              className="mt-2 rounded-lg border border-[var(--foreground)]/25 bg-[var(--foreground)]/12 px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--foreground)]/18 disabled:opacity-50"
            >
              {addPending ? "Adding…" : "Add to collection"}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  const iconClass =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-50";

  const wishlistIconClass = wishlistEntryId
    ? "inline-flex h-11 w-11 items-center justify-center rounded-full border border-red-400/50 bg-red-500/20 text-red-500 transition hover:bg-red-500/30 hover:border-red-400/65 disabled:opacity-50"
    : iconClass;

  const collectionSection = loggedIn ? (
    <section className="flex flex-col gap-2" aria-label="Your collection">
      <h2 className="text-sm font-bold tracking-tight text-white">Your collection</h2>
      <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
        {totalQuantity === 0 ? (
          <p className="text-xs leading-relaxed text-white/60">
            No sealed copies saved yet. Tap + to add with purchase details.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-white/85">
              <span className="font-semibold tabular-nums text-white">{totalQuantity}</span>{" "}
              {totalQuantity === 1 ? "copy" : "copies"} in your collection
            </p>
            <button
              type="button"
              onClick={() => void removeOneCopy()}
              disabled={addPending}
              className="text-xs font-medium text-white/55 underline decoration-white/25 underline-offset-2 hover:text-white/80"
            >
              Remove one
            </button>
          </div>
        )}
      </div>
    </section>
  ) : (
    <section className="flex flex-col gap-2" aria-label="Your collection">
      <h2 className="text-sm font-bold tracking-tight text-white">Your collection</h2>
      <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
        <p className="text-xs leading-relaxed text-white/60">
          <Link href="/login" className="font-medium text-white/90 underline decoration-white/30 underline-offset-2">
            Sign in
          </Link>{" "}
          to add sealed products to your collection or wishlist.
        </p>
      </div>
    </section>
  );

  return (
    <>
      {collectionSection}

      <section className="flex flex-col gap-2" aria-label="Market prices">
        <h2 className="text-sm font-bold tracking-tight text-white">Market prices</h2>
        <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">{typeLabel}</div>
            </div>
            {loggedIn ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className={iconClass}
                  onClick={() => {
                    setAddPurchaseDate((d) => d || new Date().toISOString().slice(0, 10));
                    setAddPurchaseType("bought");
                    setAddSheetOpen(true);
                  }}
                  aria-label="Add sealed product to collection"
                >
                  <svg aria-hidden className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={wishlistIconClass}
                  onClick={() => void toggleWishlist()}
                  disabled={wishPending}
                  aria-label={wishlistEntryId ? "Remove from wishlist" : "Add to wishlist"}
                  aria-pressed={Boolean(wishlistEntryId)}
                >
                  {wishlistEntryId ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
                    </svg>
                  )}
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 divide-x divide-white/10">
            <div className="flex flex-col items-center px-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">Market</span>
              <span className="text-sm font-semibold tabular-nums text-white">{marketValueLabel}</span>
            </div>
            <div className="flex flex-col items-center px-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">Release</span>
              <span className="text-center text-sm font-semibold text-white">{releaseLabel}</span>
            </div>
          </div>
        </div>
        {ebayUrl ? (
          <a
            href={ebayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 transition hover:bg-white/[0.12]"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <img
                src="/marketplace-logos/ebay.png"
                alt=""
                aria-hidden
                className="h-8 w-auto max-h-8 max-w-[104px] shrink-0 object-contain object-left"
              />
              <span className="text-sm font-medium text-white">eBay</span>
            </div>
            <span className="max-w-[55%] shrink-0 text-right text-xs font-medium leading-snug text-white/85">
              Recent sold on eBay
            </span>
          </a>
        ) : null}
      </section>
      {loggedIn ? addSheet : null}
    </>
  );
}
