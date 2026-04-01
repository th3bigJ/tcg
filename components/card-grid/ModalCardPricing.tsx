"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildEbayUkSoldListingsUrl,
  buildPokemonEbaySoldSearchQuery,
  type EbayPokemonCardSearchParts,
} from "@/lib/ebaySoldSearchUrl";

const gbpFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const MARKETPLACE_LOGO_SRC = {
  tcgplayer: "/marketplace-logos/tcgplayer.png",
  cardmarket: "/marketplace-logos/cardmarket.png",
  ebay: "/marketplace-logos/ebay.png",
} as const;

function readUsdMarket(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  const m = o.market ?? o.marketPrice;
  return typeof m === "number" && Number.isFinite(m) ? m : null;
}

function readPsa10(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  return typeof o.psa10 === "number" && Number.isFinite(o.psa10) ? o.psa10 : null;
}

function readAce10(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  return typeof o.ace10 === "number" && Number.isFinite(o.ace10) ? o.ace10 : null;
}

const VARIANT_LABELS: Record<string, string> = {
  normal: "Normal",
  holofoil: "Holofoil",
  reverseHolofoil: "Reverse Holo",
  staffStamp: "Staff Stamp",
};

function variantLabel(key: string): string {
  return VARIANT_LABELS[key] ?? key;
}

function formatMoneyGbp(n: number): string {
  return gbpFormatter.format(n);
}

function MarketplacePricingLogo({ which }: { which: keyof typeof MARKETPLACE_LOGO_SRC }) {
  const isVertical = which === "cardmarket";
  return (
    <img
      src={MARKETPLACE_LOGO_SRC[which]}
      alt=""
      aria-hidden
      className={
        isVertical
          ? "h-10 w-auto max-h-10 max-w-[56px] shrink-0 object-contain object-left"
          : "h-8 w-auto max-h-8 max-w-[104px] shrink-0 object-contain object-left"
      }
    />
  );
}

export function ModalCardPricing({
  masterCardId,
  externalId,
  legacyExternalId,
  ebayCardContext,
  onVariantsLoaded,
  onAdd,
  onWishlist,
  wishlisted,
  wishlistedVariant,
}: {
  masterCardId?: string;
  externalId?: string;
  legacyExternalId?: string;
  ebayCardContext: EbayPokemonCardSearchParts;
  onVariantsLoaded?: (variants: string[]) => void;
  onAdd?: (variant: string) => void;
  onWishlist?: (variant: string) => void;
  wishlisted?: boolean;
  wishlistedVariant?: string | null;
}) {
  const mid = masterCardId?.trim() ?? "";
  const ext = externalId?.trim() ?? "";
  const showDexRows = Boolean(mid || ext);

  const [payload, setPayload] = useState<{ tcgplayer: unknown; cardmarket: unknown } | null>(null);
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const onVariantsLoadedRef = useRef(onVariantsLoaded);
  onVariantsLoadedRef.current = onVariantsLoaded;

  useEffect(() => {
    if (!mid && !ext) return;
    let cancelled = false;

    const load = async () => {
      try {
        setPricingLoaded(false);
        setPayload(null);
        const params = new URLSearchParams();
        const legacy = legacyExternalId?.trim() ?? "";
        if (legacy && !mid) params.set("fallbackExternalId", legacy);
        const url = mid
          ? `/api/card-pricing/by-master/${encodeURIComponent(mid)}`
          : `/api/card-prices/${encodeURIComponent(ext)}${params.size > 0 ? `?${params.toString()}` : ""}`;
        const r = await fetch(url);
        if (cancelled) return;
        let j: { tcgplayer?: unknown; cardmarket?: unknown };
        try {
          j = (await r.json()) as { tcgplayer?: unknown; cardmarket?: unknown };
        } catch {
          j = {};
        }
        if (cancelled) return;
        const tp = j.tcgplayer ?? null;
        setPayload({ tcgplayer: tp, cardmarket: j.cardmarket ?? null });
        const cb = onVariantsLoadedRef.current;
        if (cb) {
          const tpObj = tp && typeof tp === "object" ? (tp as Record<string, unknown>) : null;
          const keys = tpObj
            ? Object.entries(tpObj)
                .filter(([, block]) => readUsdMarket(block) !== null || readPsa10(block) !== null || readAce10(block) !== null)
                .map(([key]) => key)
            : [];
          cb(keys.length > 0 ? keys : ["Unlisted"]);
        }
      } catch {
        if (!cancelled) {
          setPayload({ tcgplayer: null, cardmarket: null });
          onVariantsLoadedRef.current?.(["Unlisted"]);
        }
      } finally {
        if (!cancelled) setPricingLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mid, ext, legacyExternalId]);

  const ebayQuery = buildPokemonEbaySoldSearchQuery(ebayCardContext);
  const ebayUrl =
    ebayCardContext.cardName.trim().length > 0 && ebayQuery.trim().length > 0
      ? buildEbayUkSoldListingsUrl(ebayQuery)
      : null;

  const tpRoot = payload?.tcgplayer;
  const tpObj = tpRoot && typeof tpRoot === "object" ? (tpRoot as Record<string, unknown>) : null;

  const variantRows = useMemo(() => {
    if (!tpObj) return [];
    return Object.entries(tpObj)
      .map(([key, block]) => ({
        key,
        raw: readUsdMarket(block),
        psa10: readPsa10(block),
        ace10: readAce10(block),
      }))
      .filter(({ raw, psa10, ace10 }) => raw !== null || psa10 !== null || ace10 !== null);
  }, [tpObj]);

  const showUnlistedRow = pricingLoaded && variantRows.length === 0 && (onAdd ?? onWishlist);
  const unlistedWishlisted = Boolean(
    showUnlistedRow && wishlisted && (!wishlistedVariant || wishlistedVariant === "Unlisted"),
  );
  const pricingResolved = !showDexRows || pricingLoaded;

  if (!pricingResolved) {
    if (!showDexRows && !ebayUrl) return null;
    return (
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold tracking-tight text-white">Market prices</h4>
        <div className="flex flex-col gap-2">
          {showDexRows ? <div className="h-[52px] animate-pulse rounded-2xl bg-white/10" /> : null}
          {ebayUrl ? (
            <a
              href={ebayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 transition hover:bg-white/[0.12]"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <MarketplacePricingLogo which="ebay" />
                <span className="text-sm font-medium text-white">eBay</span>
              </div>
              <span className="max-w-[55%] shrink-0 text-right text-xs font-medium leading-snug text-white/85">
                Recent sold on eBay
              </span>
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  if (!showDexRows && !ebayUrl) return null;

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-bold tracking-tight text-white">Market prices</h4>
      <div className="flex flex-col gap-2">
        {showDexRows
          ? variantRows.map(({ key, raw, psa10, ace10 }) => {
              const isFilled = wishlistedVariant === key;
              return (
                <div
                  key={key}
                  className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium text-white">{variantLabel(key)}</span>
                    {onAdd ? (
                      <button
                        type="button"
                        onClick={() => onAdd(key)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[1.25rem] font-semibold text-white transition hover:bg-white/20"
                        aria-label={`Add ${variantLabel(key)} to collection`}
                      >
                        +
                      </button>
                    ) : null}
                    {onWishlist ? (
                      <button
                        type="button"
                        onClick={() => onWishlist(key)}
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 transition hover:bg-white/20 ${isFilled ? "" : "text-white"}`}
                        aria-label={isFilled ? "Remove from wishlist" : `Add ${variantLabel(key)} to wishlist`}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill={isFilled ? "currentColor" : "none"}
                          stroke={isFilled ? "none" : "currentColor"}
                          strokeWidth={isFilled ? undefined : 2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={isFilled ? "text-red-500" : "text-white"}
                          aria-hidden
                        >
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                  {raw !== null || psa10 !== null || ace10 !== null ? (
                    <div className="grid grid-cols-3 divide-x divide-white/10">
                      {raw !== null ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">Raw</span>
                          <span className="text-sm font-semibold tabular-nums text-white">{formatMoneyGbp(raw)}</span>
                        </div>
                      ) : <div />}
                      {psa10 !== null ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">PSA 10</span>
                          <span className="text-sm font-semibold tabular-nums text-white">{formatMoneyGbp(psa10)}</span>
                        </div>
                      ) : <div />}
                      {ace10 !== null ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">ACE 10</span>
                          <span className="text-sm font-semibold tabular-nums text-white">{formatMoneyGbp(ace10)}</span>
                        </div>
                      ) : <div />}
                    </div>
                  ) : null}
                </div>
              );
            })
          : null}
        {showUnlistedRow ? (
          <div className="flex min-h-[52px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-3">
            <span className="shrink-0 text-sm font-medium text-white">Unlisted</span>
            <div className="flex flex-1 items-center justify-evenly">
              <span className="text-xs text-white/40">No price data</span>
            </div>
            {onAdd ? (
              <button
                type="button"
                onClick={() => onAdd("Unlisted")}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[1.25rem] font-semibold text-white transition hover:bg-white/20"
                aria-label="Add unlisted variant to collection"
              >
                +
              </button>
            ) : null}
            {onWishlist ? (
              <button
                type="button"
                onClick={() => onWishlist("Unlisted")}
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 transition hover:bg-white/20 ${unlistedWishlisted ? "" : "text-white"}`}
                aria-label={unlistedWishlisted ? "Remove from wishlist" : "Add unlisted variant to wishlist"}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill={unlistedWishlisted ? "currentColor" : "none"}
                  stroke={unlistedWishlisted ? "none" : "currentColor"}
                  strokeWidth={unlistedWishlisted ? undefined : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={unlistedWishlisted ? "text-red-500" : "text-white"}
                  aria-hidden
                >
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
        {ebayUrl ? (
          <a
            href={ebayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 transition hover:bg-white/[0.12]"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <MarketplacePricingLogo which="ebay" />
              <span className="text-sm font-medium text-white">eBay</span>
            </div>
            <span className="max-w-[55%] shrink-0 text-right text-xs font-medium leading-snug text-white/85">
              Recent sold on eBay
            </span>
          </a>
        ) : null}
      </div>
    </section>
  );
}
