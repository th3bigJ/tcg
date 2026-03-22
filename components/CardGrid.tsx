"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import type { CardsPageCardEntry } from "@/lib/cardsPageQueries";
import {
  buildEbayUkSoldListingsUrl,
  buildPokemonEbaySoldSearchQuery,
  type EbayPokemonCardSearchParts,
} from "@/lib/ebaySoldSearchUrl";
import {
  buildCardmarketPokemonSinglesProductPathUrl,
  buildCardmarketPokemonSinglesSearchUrl,
  buildPokemonMarketplaceSearchQuery,
  buildTcgplayerProductPageUrl,
  buildTcgplayerPokemonProductSearchUrl,
} from "@/lib/marketplaceSearchUrls";
import type { CollectionLineSummary } from "@/lib/storefrontCardMaps";
import {
  getTcgplayerVariantBlock,
  readTcgplayerProductIdFromBlock,
  tcgVariantHasMarketPrice,
} from "@/lib/tcgdexMarketLinks";
import { TCG_PRICE_VARIANTS, type TcgPriceVariant } from "@/lib/tcgdexTcgplayerVariants";

export type CardEntry = CardsPageCardEntry & {
  collectionEntryId?: string;
  wishlistEntryId?: string;
  conditionLabel?: string;
  quantity?: number;
  printing?: string;
  language?: string;
  priority?: "low" | "medium" | "high";
  targetConditionId?: string;
  targetPrinting?: string;
};

const PRINTING_OPTIONS = [
  "Standard",
  "Reverse Holo",
  "Holo",
  "First Edition",
  "Shadowless",
  "other",
] as const;

const TCG_VARIANTS = TCG_PRICE_VARIANTS;

function readUsdMarket(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  const m = o.market ?? o.marketPrice;
  return typeof m === "number" && Number.isFinite(m) ? m : null;
}

function readUsdLowHigh(block: unknown): { low: number | null; high: number | null } {
  if (!block || typeof block !== "object") return { low: null, high: null };
  const o = block as Record<string, unknown>;
  const low = typeof o.low === "number" && Number.isFinite(o.low) ? o.low : null;
  const high = typeof o.high === "number" && Number.isFinite(o.high) ? o.high : null;
  return { low, high };
}

function formatMoneyGbp(n: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

const MARKETPLACE_LOGO_SRC = {
  tcgplayer: "/marketplace-logos/tcgplayer.png",
  cardmarket: "/marketplace-logos/cardmarket.png",
  ebay: "/marketplace-logos/ebay.png",
} as const;

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

function ModalCardPricing({
  externalId,
  ebayCardContext,
}: {
  externalId?: string;
  ebayCardContext: EbayPokemonCardSearchParts;
}) {
  const ext = externalId?.trim() ?? "";
  const showDexRows = Boolean(ext);

  const [payload, setPayload] = useState<{ tcgplayer: unknown; cardmarket: unknown } | null>(null);
  const [variant, setVariant] = useState<TcgPriceVariant>("normal");
  const [pricingLoaded, setPricingLoaded] = useState(false);

  useEffect(() => {
    if (!ext) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPricingLoaded(false);
      setPayload(null);
      setVariant("normal");
      fetch(`/api/card-prices/${encodeURIComponent(ext)}`)
        .then((r) => r.json() as Promise<{ tcgplayer?: unknown; cardmarket?: unknown }>)
        .then((j) => {
          if (cancelled) return;
          const tcgplayer = j.tcgplayer ?? null;
          const cardmarket = j.cardmarket ?? null;
          setPayload({ tcgplayer, cardmarket });
          if (tcgplayer && typeof tcgplayer === "object") {
            const tp = tcgplayer as Record<string, unknown>;
            const firstWithPrice = TCG_VARIANTS.find((k) => tcgVariantHasMarketPrice(tp, k));
            if (firstWithPrice) setVariant(firstWithPrice);
          }
        })
        .catch(() => {
          if (!cancelled) setPayload({ tcgplayer: null, cardmarket: null });
        })
        .finally(() => {
          if (!cancelled) setPricingLoaded(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [ext]);

  const ebayQuery = buildPokemonEbaySoldSearchQuery(ebayCardContext);
  const ebayUrl =
    ebayCardContext.cardName.trim().length > 0 && ebayQuery.trim().length > 0
      ? buildEbayUkSoldListingsUrl(ebayQuery)
      : null;

  const marketplaceSearchQuery = useMemo(
    () => buildPokemonMarketplaceSearchQuery(ebayCardContext),
    [
      ebayCardContext.cardName,
      ebayCardContext.cardNumber,
      ebayCardContext.setCode,
      ebayCardContext.setName,
    ],
  );

  const tpRoot = payload?.tcgplayer;
  const cmRoot = payload?.cardmarket;
  const hasTp = tpRoot && typeof tpRoot === "object";
  const hasCm = cmRoot && typeof cmRoot === "object";
  const tpObj = hasTp ? (tpRoot as Record<string, unknown>) : null;
  const cmObj = hasCm ? (cmRoot as Record<string, unknown>) : null;

  const tcgplayerSearchUrl = useMemo(() => {
    if (tpObj) {
      const order: TcgPriceVariant[] = [variant, ...TCG_VARIANTS.filter((v) => v !== variant)];
      for (const v of order) {
        const block = getTcgplayerVariantBlock(tpObj, v);
        const pid = readTcgplayerProductIdFromBlock(block);
        if (pid !== null) {
          return buildTcgplayerProductPageUrl({
            productId: pid,
            setTcgdexId: ebayCardContext.setTcgdexId,
            setName: ebayCardContext.setName,
            cardName: ebayCardContext.cardName,
            cardNumber: ebayCardContext.cardNumber,
            externalId: ext || undefined,
            setCardCountOfficial: ebayCardContext.setCardCountOfficial,
          });
        }
      }
    }
    return buildTcgplayerPokemonProductSearchUrl(marketplaceSearchQuery);
  }, [
    tpObj,
    variant,
    ext,
    ebayCardContext.setTcgdexId,
    ebayCardContext.setName,
    ebayCardContext.setCardCountOfficial,
    ebayCardContext.cardName,
    ebayCardContext.cardNumber,
    marketplaceSearchQuery,
  ]);

  const cardmarketSearchUrl = useMemo(() => {
    const path = buildCardmarketPokemonSinglesProductPathUrl({
      setSlug: ebayCardContext.setSlug,
      setName: ebayCardContext.setName,
      setCode: ebayCardContext.setCode,
      cardName: ebayCardContext.cardName,
      cardNumber: ebayCardContext.cardNumber,
      externalId: ext || undefined,
      listingVersion: ebayCardContext.cardmarketListingVersion,
    });
    if (path) return path;
    return buildCardmarketPokemonSinglesSearchUrl(marketplaceSearchQuery);
  }, [
    ext,
    ebayCardContext.setSlug,
    ebayCardContext.setName,
    ebayCardContext.setCode,
    ebayCardContext.cardName,
    ebayCardContext.cardNumber,
    ebayCardContext.cardmarketListingVersion,
    marketplaceSearchQuery,
  ]);

  const pricingResolved = !showDexRows || pricingLoaded;

  if (!pricingResolved) {
    if (!showDexRows && !ebayUrl) return null;
    return (
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold tracking-tight text-white">Market prices</h4>
        <div className="flex flex-col gap-2">
          {showDexRows ? (
            <>
              <div className="h-[52px] animate-pulse rounded-2xl bg-white/10" />
              <div className="h-[52px] animate-pulse rounded-2xl bg-white/10" />
            </>
          ) : null}
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

  const variantBlock = tpObj ? getTcgplayerVariantBlock(tpObj, variant) : null;
  /** Values from `/api/card-prices` are converted to GBP on the server. */
  const marketGbp = readUsdMarket(variantBlock);
  const { low: lowGbp, high: highGbp } = readUsdLowHigh(variantBlock);

  const trendRaw =
    cmObj &&
    (typeof cmObj.trendPrice === "number"
      ? cmObj.trendPrice
      : typeof cmObj.trend === "number"
        ? cmObj.trend
        : null);
  const avg30 =
    cmObj && typeof cmObj.avg30 === "number" && Number.isFinite(cmObj.avg30) ? cmObj.avg30 : null;

  const variantsAvailable = TCG_VARIANTS.filter((k) => tpObj && tcgVariantHasMarketPrice(tpObj, k));

  const tcgPriceLabel =
    marketGbp !== null
      ? formatMoneyGbp(marketGbp)
      : lowGbp !== null || highGbp !== null
        ? `${lowGbp !== null ? formatMoneyGbp(lowGbp) : "—"} – ${highGbp !== null ? formatMoneyGbp(highGbp) : "—"}`
        : null;

  /** Cardmarket figures are EUR from TCGdex, converted to GBP in the API. */
  const cmPrimary =
    trendRaw !== null ? formatMoneyGbp(trendRaw) : avg30 !== null ? formatMoneyGbp(avg30) : null;

  if (!showDexRows && !ebayUrl) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold tracking-tight text-white">Market prices</h4>
        {showDexRows && variantsAvailable.length > 1 ? (
          <label className="flex items-center gap-1.5 text-[10px] text-white/60">
            <span className="sr-only">TCGPlayer variant</span>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as TcgPriceVariant)}
              className="max-w-[140px] rounded-md border border-white/20 bg-black/40 px-2 py-1 text-[11px] text-white"
            >
              {variantsAvailable.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {showDexRows ? (
          tcgplayerSearchUrl ? (
            <a
              href={tcgplayerSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 transition hover:bg-white/[0.12]"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <MarketplacePricingLogo which="tcgplayer" />
                <span className="text-sm font-medium text-white">TCGPlayer</span>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-white">
                {tcgPriceLabel ?? "—"}
              </span>
            </a>
          ) : (
            <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <MarketplacePricingLogo which="tcgplayer" />
                <span className="text-sm font-medium text-white">TCGPlayer</span>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-white">
                {tcgPriceLabel ?? "—"}
              </span>
            </div>
          )
        ) : null}
        {showDexRows ? (
          cardmarketSearchUrl ? (
            <a
              href={cardmarketSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 transition hover:bg-white/[0.12]"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <MarketplacePricingLogo which="cardmarket" />
                <span className="text-sm font-medium text-white">Cardmarket</span>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-white">
                {cmPrimary ?? "—"}
              </span>
            </a>
          ) : (
            <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <MarketplacePricingLogo which="cardmarket" />
                <span className="text-sm font-medium text-white">Cardmarket</span>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-white">
                {cmPrimary ?? "—"}
              </span>
            </div>
          )
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

function mergeCollectionLine(
  prev: Record<string, CollectionLineSummary[]>,
  masterCardId: string,
  line: CollectionLineSummary,
): Record<string, CollectionLineSummary[]> {
  const next: Record<string, CollectionLineSummary[]> = { ...prev };
  const list = [...(next[masterCardId] ?? []), line];
  list.sort((a, b) => {
    const c = a.conditionLabel.localeCompare(b.conditionLabel);
    if (c !== 0) return c;
    const p = a.printing.localeCompare(b.printing);
    if (p !== 0) return p;
    return a.language.localeCompare(b.language);
  });
  next[masterCardId] = list;
  return next;
}

function replaceCollectionLineQuantity(
  prev: Record<string, CollectionLineSummary[]>,
  masterCardId: string,
  entryId: string,
  newQuantity: number,
): Record<string, CollectionLineSummary[]> {
  const next: Record<string, CollectionLineSummary[]> = { ...prev };
  const list = [...(next[masterCardId] ?? [])];
  const idx = list.findIndex((l) => l.entryId === entryId);
  if (idx < 0) return prev;
  if (newQuantity < 1) {
    list.splice(idx, 1);
  } else {
    list[idx] = { ...list[idx], quantity: newQuantity };
  }
  if (list.length === 0) {
    delete next[masterCardId];
  } else {
    next[masterCardId] = list;
  }
  return next;
}

function ModalYourCollectionSection({
  lines,
  variant,
  customerLoggedIn,
  masterCardId,
  onAdjustQuantity,
  adjustingEntryId,
}: {
  lines: CollectionLineSummary[];
  variant: "browse" | "collection" | "wishlist";
  customerLoggedIn: boolean;
  masterCardId?: string;
  onAdjustQuantity?: (entryId: string, delta: -1 | 1) => void;
  adjustingEntryId?: string | null;
}) {
  if (!masterCardId) return null;
  if (variant === "browse" && !customerLoggedIn) return null;
  if (variant !== "browse" && !customerLoggedIn && lines.length === 0) return null;

  const showQuantityControls = Boolean(customerLoggedIn && onAdjustQuantity);

  return (
    <section className="flex flex-col gap-2" aria-label="Your collection">
      <h4 className="text-sm font-bold tracking-tight text-white">Your collection</h4>
      {lines.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
          <p className="text-xs leading-relaxed text-white/60">
            No copies saved for this card yet. Tap + to add quantity, condition, and printing.
          </p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lines.map((line) => {
            const busy = adjustingEntryId === line.entryId;
            return (
              <li key={line.entryId}>
                <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug text-white">{line.printing}</div>
                    <div className="mt-0.5 text-[10px] leading-snug text-white/55">
                      {line.conditionLabel}
                    </div>
                  </div>
                  {showQuantityControls ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAdjustQuantity?.(line.entryId, -1)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-lg font-semibold leading-none text-white transition hover:bg-white/20 disabled:opacity-40"
                        aria-label={`Remove one ${line.printing} copy`}
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums text-white">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAdjustQuantity?.(line.entryId, 1)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-lg font-semibold leading-none text-white transition hover:bg-white/20 disabled:opacity-40"
                        aria-label={`Add one ${line.printing} copy`}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-white">
                      ×{line.quantity}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatSetReleaseDate(iso: string | undefined): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function compareCardsForOtherStrip(a: CardEntry, b: CardEntry): number {
  const ta = a.setReleaseDate ? new Date(a.setReleaseDate).getTime() : 0;
  const tb = b.setReleaseDate ? new Date(b.setReleaseDate).getTime() : 0;
  if (ta !== tb) return tb - ta;
  const sc = a.set.localeCompare(b.set);
  if (sc !== 0) return sc;
  return (a.cardNumber || "").localeCompare(b.cardNumber || "", undefined, { numeric: true });
}

function sameCardEntry(a: CardEntry | null, b: CardEntry | null): boolean {
  if (!a || !b) return false;
  if (a.masterCardId && b.masterCardId) return a.masterCardId === b.masterCardId;
  return a.set === b.set && a.filename === b.filename;
}

/** Keep in sync with `globals.css` `.card-viewer-overlay` `--card-viewer-carousel-gap` (used in transform math). */
const MODAL_CAROUSEL_GAP_PX = 32;

type ModalPrimaryActions = {
  onAdd: () => void;
  onWishlist: () => void;
  wishlistFilled: boolean;
  wishPending: boolean;
};

function ModalCarouselSlide({
  card,
  slotWidth,
  showMeta,
  setLogosByCode,
  primaryActions = null,
}: {
  card: CardEntry | null;
  slotWidth: number;
  showMeta: boolean;
  setLogosByCode?: Record<string, string>;
  primaryActions?: ModalPrimaryActions | null;
}) {
  const w = Math.max(1, slotWidth);
  return (
    <div
      className="flex shrink-0 flex-col items-center gap-3 md:gap-5"
      style={{ width: w, minWidth: w, maxWidth: w }}
    >
      <div className="relative flex min-h-[50vh] w-full items-end justify-center pb-0 sm:min-h-[50vh] md:min-h-[min(82vh,820px)] md:max-h-[88vh] md:items-center md:pb-0">
        {card ? (
          <img
            src={card.highSrc || card.lowSrc || ""}
            alt={`${card.set} ${card.filename}`}
            className="block max-h-[min(64vh,640px)] w-auto max-w-[min(calc(100vw-1.5rem),100%)] rounded-[var(--card-viewer-image-radius)] object-contain shadow-2xl md:max-h-[min(86vh,900px)] md:max-w-full"
            draggable={false}
          />
        ) : (
          <div
            className="aspect-[3/4] max-h-[min(64vh,640px)] w-[min(85%,240px)] rounded-[var(--card-viewer-image-radius)] bg-white/[0.06] md:max-h-[min(86vh,900px)]"
            aria-hidden
          />
        )}
      </div>
      {showMeta && card ? (
        (() => {
          const modalSetLogoSrc = card.setLogoSrc || setLogosByCode?.[card.set] || "";
          const modalSetLabel = card.setName || card.set;
          const showSideActions = Boolean(primaryActions && card.masterCardId);

          const titleAndSet = (
            <>
              <h3 className="text-balance text-xl font-bold leading-tight md:text-2xl">
                {card.cardName || "Unknown card"}
              </h3>
              <p className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-sm leading-snug text-white/75">
                {modalSetLogoSrc ? (
                  <img
                    src={modalSetLogoSrc}
                    alt={`${modalSetLabel} set logo`}
                    className="h-7 max-h-8 w-auto max-w-[140px] object-contain"
                  />
                ) : null}
                <span className="min-w-0 font-medium text-white/85">{modalSetLabel}</span>
              </p>
            </>
          );

          if (showSideActions && primaryActions) {
            return (
              <div className="w-full max-w-lg px-3 py-4 text-white sm:px-5 md:max-w-none md:py-0 md:pb-1">
                <div className="mx-auto flex w-full max-w-2xl items-center gap-2 sm:gap-3 sm:px-2 lg:max-w-3xl">
                  <button
                    type="button"
                    disabled={!card.masterCardId}
                    onClick={primaryActions.onAdd}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-xl font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
                    aria-label="Add to collection"
                  >
                    +
                  </button>
                  <div className="min-w-0 flex-1 text-center">{titleAndSet}</div>
                  <button
                    type="button"
                    disabled={primaryActions.wishPending || !card.masterCardId}
                    onClick={primaryActions.onWishlist}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 transition hover:bg-white/20 disabled:opacity-40 ${
                      primaryActions.wishlistFilled ? "" : "text-white"
                    }`}
                    aria-label={primaryActions.wishlistFilled ? "Remove from wishlist" : "Add to wishlist"}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill={primaryActions.wishlistFilled ? "currentColor" : "none"}
                      stroke={primaryActions.wishlistFilled ? "none" : "currentColor"}
                      strokeWidth={primaryActions.wishlistFilled ? undefined : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={primaryActions.wishlistFilled ? "text-red-500" : "text-white"}
                      aria-hidden
                    >
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="w-full max-w-lg px-1 py-4 text-center text-white md:max-w-none md:py-0 md:pb-1">
              {titleAndSet}
            </div>
          );
        })()
      ) : null}
    </div>
  );
}

function toPositiveNationalDexNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n > 0 ? n : null;
  }
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  if (typeof value === "string") {
    const n = Number.parseInt(value.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** Collect Dex numbers from Payload jsonb shapes: [25], [{ value: 25 }], nested, or split across dexId / dex_ids. */
function collectNationalDexNumbers(raw: unknown, out: Set<number>, depth: number): void {
  if (depth > 10 || raw === null || raw === undefined) return;
  const single = toPositiveNationalDexNumber(raw);
  if (single !== null) {
    out.add(single);
    return;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      collectNationalDexNumbers(item, out, depth + 1);
    }
    return;
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if ("value" in o) collectNationalDexNumbers(o.value, out, depth + 1);
    if ("dexId" in o) collectNationalDexNumbers(o.dexId, out, depth + 1);
    if ("dex_id" in o) collectNationalDexNumbers(o.dex_id, out, depth + 1);
  }
}

function normalizedNationalDexIds(card: CardEntry): number[] | undefined {
  const rec = card as CardEntry & Record<string, unknown>;
  const out = new Set<number>();
  collectNationalDexNumbers(rec.dexIds, out, 0);
  collectNationalDexNumbers(rec.dexId, out, 0);
  collectNationalDexNumbers(rec.dex_id, out, 0);
  const sorted = [...out].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : undefined;
}

function AttributeIconIllustrator() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/80" aria-hidden>
      <path
        d="M12 19c4.418 0 8-1.79 8-4 0-1.657-2.239-3.09-5.5-3.69M12 19c-4.418 0-8-1.79-8-4 0-1.657 2.239-3.09 5.5-3.69M12 19V9m0 0C8.5 8.5 6 6.5 6 4c0-2.21 3.582-4 8-4s8 1.79 8 4c0 2.5-2.5 4.5-6 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AttributeIconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/80" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function AttributeIconStar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/80" aria-hidden>
      <path
        d="M12 3.5 14.2 9l5.8.4-4.5 3.8 1.4 5.7L12 16.9 6.1 18.9l1.4-5.7L3 9.4 8.8 9 12 3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AttributeIconHash() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/80" aria-hidden>
      <path
        d="M10 4 8 20M16 4l-2 16M4 9h16M3 15h16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AttributeIconBolt() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/80" aria-hidden>
      <path
        d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AttributeIconBadge() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/80" aria-hidden>
      <path
        d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5l-7 4-7-4V7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AttributeIconLayers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/80" aria-hidden>
      <path
        d="m12 4 9 5-9 5-9-5 9-5Zm9 7-9 5-9-5M21 16l-9 5-9-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AttributeIconHeart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-white/80" aria-hidden>
      <path
        d="M12 21s-6-4.5-6-9a4 4 0 0 1 6.5-3 4 4 0 0 1 7 3c0 4.5-6 9-6 9Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ModalAttributeRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  const display = value.trim() ? value.trim() : "—";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-white/50">{label}</div>
        <div className="mt-0.5 text-sm font-medium leading-snug text-white">{display}</div>
      </div>
    </div>
  );
}

export function CardGrid({
  cards,
  setLogosByCode,
  variant = "browse",
  customerLoggedIn = false,
  itemConditions = [],
  wishlistEntryIdsByMasterCardId = {},
  collectionLinesByMasterCardId = {},
}: {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  variant?: "browse" | "collection" | "wishlist";
  customerLoggedIn?: boolean;
  itemConditions?: { id: string; name: string }[];
  wishlistEntryIdsByMasterCardId?: Record<string, string>;
  collectionLinesByMasterCardId?: Record<string, CollectionLineSummary[]>;
}) {
  const router = useRouter();
  const [localWishlistMap, setLocalWishlistMap] = useState(wishlistEntryIdsByMasterCardId);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addConditionId, setAddConditionId] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [addPrinting, setAddPrinting] = useState<string>("Standard");
  const [addPending, setAddPending] = useState(false);
  const [wishPending, setWishPending] = useState(false);
  const [adjustingCollectionEntryId, setAdjustingCollectionEntryId] = useState<string | null>(null);

  const serializedWishlist = JSON.stringify(wishlistEntryIdsByMasterCardId);
  useEffect(() => {
    try {
      setLocalWishlistMap(JSON.parse(serializedWishlist) as Record<string, string>);
    } catch {
      setLocalWishlistMap({});
    }
  }, [serializedWishlist]);

  const [localCollectionLinesByMasterCardId, setLocalCollectionLinesByMasterCardId] = useState<
    Record<string, CollectionLineSummary[]>
  >(collectionLinesByMasterCardId);
  const serializedCollectionLines = JSON.stringify(collectionLinesByMasterCardId);
  useEffect(() => {
    try {
      setLocalCollectionLinesByMasterCardId(
        JSON.parse(serializedCollectionLines) as Record<string, CollectionLineSummary[]>,
      );
    } catch {
      setLocalCollectionLinesByMasterCardId({});
    }
  }, [serializedCollectionLines]);

  const normalizedCards = cards
    .map((card) => {
      const lowSrc = card.lowSrc || card.src || "";
      const highSrc = card.highSrc || lowSrc;
      const dexIds = normalizedNationalDexIds(card);
      return { ...card, lowSrc, highSrc, ...(dexIds ? { dexIds } : {}) };
    })
    .filter((card) => card.lowSrc);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [standaloneModalCard, setStandaloneModalCard] = useState<CardEntry | null>(null);
  const [nationalDexStrip, setNationalDexStrip] = useState<CardEntry[]>([]);
  const [nationalDexStripLoading, setNationalDexStripLoading] = useState(false);
  const [nationalDexStripError, setNationalDexStripError] = useState(false);

  const selectedCard =
    standaloneModalCard ??
    (selectedIndex !== null ? (normalizedCards[selectedIndex] ?? null) : null);

  const selectedIndexRef = useRef<number | null>(null);
  const standaloneModalCardRef = useRef<CardEntry | null>(null);
  selectedIndexRef.current = selectedIndex;
  standaloneModalCardRef.current = standaloneModalCard;

  /** Horizontal swipe / carousel follows the main grid order only (not the “Other cards” dex strip). */
  const hasPrevious = selectedIndex !== null && selectedIndex > 0;

  const hasNext =
    selectedIndex !== null && selectedIndex < normalizedCards.length - 1;

  const modalAdjacentCards = useMemo(() => {
    if (!selectedCard) {
      return { prev: null as CardEntry | null, next: null as CardEntry | null };
    }

    if (selectedIndex !== null && standaloneModalCard === null) {
      return {
        prev: selectedIndex > 0 ? normalizedCards[selectedIndex - 1] : null,
        next:
          selectedIndex < normalizedCards.length - 1
            ? normalizedCards[selectedIndex + 1]
            : null,
      };
    }

    return { prev: null as CardEntry | null, next: null as CardEntry | null };
  }, [normalizedCards, selectedCard, selectedIndex, standaloneModalCard]);

  const collectionLinesForSelected = useMemo(() => {
    const mid = selectedCard?.masterCardId;
    if (!mid) return [];
    return localCollectionLinesByMasterCardId[mid] ?? [];
  }, [localCollectionLinesByMasterCardId, selectedCard?.masterCardId]);

  const [carouselSlotWidth, setCarouselSlotWidth] = useState(0);
  const carouselSlotWidthRef = useRef(360);
  /** Measured column for carousel viewport width; must exist before layout effect. */
  const leftColumnRef = useRef<HTMLDivElement>(null);
  /** Scroll container for the modal (`overflow-y-auto` overlay); swipe-down-to-close only when scrolled to top. */
  const modalScrollContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!selectedCard) {
      setCarouselSlotWidth(0);
      return;
    }
    const el = leftColumnRef.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      setCarouselSlotWidth(cw);
      if (cw > 0) carouselSlotWidthRef.current = cw;
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedCard?.filename, selectedCard?.set, selectedIndex, standaloneModalCard]);

  const openModal = useCallback((index: number) => {
    setStandaloneModalCard(null);
    setSelectedIndex(index);
  }, []);

  const closeModal = useCallback(() => {
    setAddSheetOpen(false);
    setSelectedIndex(null);
    setStandaloneModalCard(null);
    setNationalDexStrip([]);
    setNationalDexStripLoading(false);
    setNationalDexStripError(false);
  }, []);

  const goLogin = useCallback(() => {
    router.push("/login");
  }, [router]);

  const onOpenAddSheet = useCallback(() => {
    if (!customerLoggedIn) {
      goLogin();
      return;
    }
    if (!selectedCard?.masterCardId) return;
    setAddConditionId(itemConditions[0]?.id ?? "");
    setAddQuantity(1);
    setAddPrinting("Standard");
    setAddSheetOpen(true);
  }, [customerLoggedIn, goLogin, itemConditions, selectedCard?.masterCardId]);

  const submitAddCollection = useCallback(async () => {
    if (!selectedCard?.masterCardId) return;
    setAddPending(true);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterCardId: selectedCard.masterCardId,
          conditionId: addConditionId || undefined,
          quantity: addQuantity,
          printing: addPrinting,
          language: "English",
        }),
      });
      if (!res.ok) return;
      const j = (await res.json()) as { doc?: { id?: string | number } };
      const rawId = j.doc?.id;
      const mid = selectedCard.masterCardId;
      if (rawId !== undefined && mid) {
        const conditionName = addConditionId
          ? itemConditions.find((c) => c.id === addConditionId)?.name?.trim() || "—"
          : "—";
        const line: CollectionLineSummary = {
          entryId: String(rawId),
          quantity: addQuantity,
          conditionLabel: conditionName,
          printing: addPrinting,
          language: "English",
        };
        setLocalCollectionLinesByMasterCardId((prev) => mergeCollectionLine(prev, mid, line));
      }
      setAddSheetOpen(false);
      router.refresh();
    } finally {
      setAddPending(false);
    }
  }, [
    addConditionId,
    addPrinting,
    addQuantity,
    itemConditions,
    router,
    selectedCard?.masterCardId,
  ]);

  const adjustCollectionQuantity = useCallback(
    async (entryId: string, delta: -1 | 1) => {
      const mid = selectedCard?.masterCardId;
      if (!mid || !customerLoggedIn) return;
      const lines = localCollectionLinesByMasterCardId[mid];
      const line = lines?.find((l) => l.entryId === entryId);
      if (!line) return;
      const nextQty = line.quantity + delta;
      setAdjustingCollectionEntryId(entryId);
      try {
        if (nextQty < 1) {
          const res = await fetch(`/api/collection?id=${encodeURIComponent(entryId)}`, {
            method: "DELETE",
          });
          if (res.ok) {
            setLocalCollectionLinesByMasterCardId((prev) =>
              replaceCollectionLineQuantity(prev, mid, entryId, 0),
            );
            router.refresh();
          }
        } else {
          const res = await fetch("/api/collection", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: entryId, quantity: nextQty }),
          });
          if (res.ok) {
            setLocalCollectionLinesByMasterCardId((prev) =>
              replaceCollectionLineQuantity(prev, mid, entryId, nextQty),
            );
            router.refresh();
          }
        }
      } finally {
        setAdjustingCollectionEntryId(null);
      }
    },
    [customerLoggedIn, localCollectionLinesByMasterCardId, router, selectedCard?.masterCardId],
  );

  const toggleWishlist = useCallback(async () => {
    if (!selectedCard?.masterCardId) return;
    if (!customerLoggedIn) {
      goLogin();
      return;
    }
    const mid = selectedCard.masterCardId;
    const existingId = localWishlistMap[mid];
    setWishPending(true);
    try {
      if (existingId) {
        const res = await fetch(`/api/wishlist?id=${encodeURIComponent(existingId)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setLocalWishlistMap((m) => {
            const next = { ...m };
            delete next[mid];
            return next;
          });
          router.refresh();
        }
      } else {
        const res = await fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ masterCardId: mid }),
        });
        if (res.ok) {
          const j = (await res.json()) as { doc?: { id?: string | number } };
          const wid = j.doc?.id;
          if (wid !== undefined) {
            setLocalWishlistMap((m) => ({ ...m, [mid]: String(wid) }));
          }
          router.refresh();
        }
      }
    } finally {
      setWishPending(false);
    }
  }, [customerLoggedIn, goLogin, localWishlistMap, router, selectedCard?.masterCardId]);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const axisLockRef = useRef<"none" | "h" | "v">("none");
  const swipeFromLeftColumnRef = useRef(false);
  const pendingNavRef = useRef<"next" | "prev" | null>(null);

  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [slideTransition, setSlideTransition] = useState(false);

  const viewPrevious = useCallback(() => {
    const idx = selectedIndexRef.current;
    if (standaloneModalCardRef.current !== null) return;
    if (idx !== null && idx > 0) {
      setSelectedIndex(idx - 1);
    }
  }, []);

  const viewNext = useCallback(() => {
    const idx = selectedIndexRef.current;
    if (standaloneModalCardRef.current !== null) return;
    const len = normalizedCards.length;
    if (idx !== null && idx < len - 1) {
      setSelectedIndex(idx + 1);
    }
  }, [normalizedCards.length]);

  const clampHorizontalDrag = useCallback(
    (rawX: number) => {
      let x = rawX;
      if (!hasPrevious && x > 0) x *= 0.28;
      if (!hasNext && x < 0) x *= 0.28;
      return x;
    },
    [hasNext, hasPrevious],
  );

  const handleModalTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchDeltaRef.current = { x: 0, y: 0 };
    axisLockRef.current = "none";
    pendingNavRef.current = null;
    setSlideTransition(false);

    const el = leftColumnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      swipeFromLeftColumnRef.current =
        touch.clientX >= r.left &&
        touch.clientX <= r.right &&
        touch.clientY >= r.top &&
        touch.clientY <= r.bottom;
    } else {
      swipeFromLeftColumnRef.current = false;
    }
  };

  const handleModalTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    const x = touch.clientX - start.x;
    const y = touch.clientY - start.y;
    touchDeltaRef.current = { x, y };

    const absX = Math.abs(x);
    const absY = Math.abs(y);

    if (axisLockRef.current === "none" && (absX > 12 || absY > 12)) {
      if (swipeFromLeftColumnRef.current) {
        axisLockRef.current = absX > absY ? "h" : "v";
      } else {
        axisLockRef.current = absY > absX ? "v" : "none";
      }
    }

    if (axisLockRef.current === "h" && swipeFromLeftColumnRef.current) {
      setDragOffsetX(clampHorizontalDrag(x));
    }
  };

  const handleModalTouchEnd = () => {
    const start = touchStartRef.current;
    if (!start) return;

    const { x, y } = touchDeltaRef.current;
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const horizontalThreshold = 56;
    const verticalThreshold = 72;

    const scrollTop = modalScrollContainerRef.current?.scrollTop ?? 0;
    const modalScrolledToTop = scrollTop <= 1;

    const closeFromVertical =
      modalScrolledToTop &&
      y > verticalThreshold &&
      absY > absX &&
      (axisLockRef.current === "v" || (!swipeFromLeftColumnRef.current && absY > absX));

    if (closeFromVertical) {
      closeModal();
      touchStartRef.current = null;
      touchDeltaRef.current = { x: 0, y: 0 };
      axisLockRef.current = "none";
      setDragOffsetX(0);
      setSlideTransition(false);
      return;
    }

    if (
      axisLockRef.current === "h" &&
      swipeFromLeftColumnRef.current &&
      absX > absY
    ) {
      const slot = carouselSlotWidthRef.current + MODAL_CAROUSEL_GAP_PX;
      if (x < -horizontalThreshold && hasNext) {
        pendingNavRef.current = "next";
        setSlideTransition(true);
        setDragOffsetX(-slot);
      } else if (x > horizontalThreshold && hasPrevious) {
        pendingNavRef.current = "prev";
        setSlideTransition(true);
        setDragOffsetX(slot);
      } else {
        pendingNavRef.current = null;
        setSlideTransition(true);
        setDragOffsetX(0);
      }
    } else {
      if (dragOffsetX !== 0) {
        setSlideTransition(true);
        setDragOffsetX(0);
      }
    }

    touchStartRef.current = null;
    touchDeltaRef.current = { x: 0, y: 0 };
    axisLockRef.current = "none";
  };

  const handleCardSlideTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== "transform") return;
    if (event.target !== event.currentTarget) return;
    const pending = pendingNavRef.current;
    if (pending === "next") {
      pendingNavRef.current = null;
      viewNext();
      setSlideTransition(false);
      setDragOffsetX(0);
      return;
    }
    if (pending === "prev") {
      pendingNavRef.current = null;
      viewPrevious();
      setSlideTransition(false);
      setDragOffsetX(0);
      return;
    }
    setSlideTransition(false);
  };

  useEffect(() => {
    setDragOffsetX(0);
    setSlideTransition(false);
    pendingNavRef.current = null;
  }, [selectedCard?.set, selectedCard?.filename, selectedIndex, standaloneModalCard]);

  const isModalOpen = selectedIndex !== null || standaloneModalCard !== null;

  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        viewPrevious();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        viewNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeModal, isModalOpen, viewNext, viewPrevious]);

  useEffect(() => {
    if (!isModalOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [isModalOpen]);

  const modalNationalDexIds = selectedCard ? normalizedNationalDexIds(selectedCard) : undefined;
  const nationalDexFetchKey =
    modalNationalDexIds && modalNationalDexIds.length > 0
      ? [...modalNationalDexIds].sort((a, b) => a - b).join(",")
      : "";

  useEffect(() => {
    if (!nationalDexFetchKey) {
      setNationalDexStrip([]);
      setNationalDexStripLoading(false);
      setNationalDexStripError(false);
      return;
    }

    let cancelled = false;
    setNationalDexStripLoading(true);
    setNationalDexStripError(false);

    fetch(`/api/cards/by-national-dex?ids=${encodeURIComponent(nationalDexFetchKey)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json() as Promise<{ cards?: CardEntry[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        const raw = Array.isArray(data.cards) ? data.cards : [];
        const normalized = raw
          .map((card) => {
            const lowSrc = card.lowSrc || card.src || "";
            const highSrc = card.highSrc || lowSrc;
            const dexIds = normalizedNationalDexIds(card);
            return { ...card, lowSrc, highSrc, ...(dexIds ? { dexIds } : {}) };
          })
          .filter((card) => card.lowSrc);
        normalized.sort((a, b) => compareCardsForOtherStrip(a, b));
        setNationalDexStrip(normalized);
      })
      .catch(() => {
        if (!cancelled) {
          setNationalDexStrip([]);
          setNationalDexStripError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setNationalDexStripLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nationalDexFetchKey]);

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 400;
  const fallbackCarouselWidth = Math.max(280, viewportWidth - 32);
  const carouselSlideWidth =
    carouselSlotWidth > 0 ? carouselSlotWidth : fallbackCarouselWidth;
  carouselSlotWidthRef.current = carouselSlideWidth;

  const carouselStepPx = carouselSlideWidth + MODAL_CAROUSEL_GAP_PX;
  const cardSwipeStyle: CSSProperties = {
    width: carouselSlideWidth * 3 + MODAL_CAROUSEL_GAP_PX * 2,
    gap: "var(--card-viewer-carousel-gap)",
    transform: `translate3d(${-carouselStepPx + dragOffsetX}px, 0, 0)`,
    transition: slideTransition
      ? "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)"
      : "none",
  };

  const modal = selectedCard && typeof document !== "undefined" && (
    <div
      ref={modalScrollContainerRef}
      className="card-viewer-overlay fixed inset-0 z-[9999] overflow-y-auto overscroll-y-contain"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label="Card preview"
    >
      <button
        type="button"
        onClick={closeModal}
        className="card-viewer-icon-button fixed right-4 top-4 z-[10000] hidden h-12 w-12 items-center justify-center border border-white/60 bg-black/75 text-white transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:inline-flex"
        aria-label="Close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      <div
        className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1460px] flex-col px-3 pb-14 pt-4 sm:px-6 md:px-10 md:pb-20 md:pt-8"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleModalTouchStart}
        onTouchMove={handleModalTouchMove}
        onTouchEnd={handleModalTouchEnd}
      >
        <div className="md:hidden">
          <button
            type="button"
            onClick={closeModal}
            className="mb-2 block w-full bg-transparent text-center text-[11px] text-white/65"
            aria-label="Close card preview"
          >
            Swipe down from the top to close.
          </button>
        </div>

        <div className="grid w-full gap-3 md:grid-cols-[minmax(260px,1fr)_minmax(280px,400px)] md:items-start md:gap-12">
          <div
            ref={leftColumnRef}
            className="flex w-full min-w-0 flex-col items-center gap-3 md:gap-5"
          >
            <div className="w-full overflow-hidden">
              <div
                className="card-viewer-swipe-group flex will-change-transform"
                style={cardSwipeStyle}
                onTransitionEnd={handleCardSlideTransitionEnd}
              >
                <ModalCarouselSlide
                  card={modalAdjacentCards.prev}
                  slotWidth={carouselSlideWidth}
                  showMeta={false}
                  setLogosByCode={setLogosByCode}
                />
                <ModalCarouselSlide
                  card={selectedCard}
                  slotWidth={carouselSlideWidth}
                  showMeta
                  setLogosByCode={setLogosByCode}
                  primaryActions={
                    selectedCard.masterCardId
                      ? {
                          onAdd: onOpenAddSheet,
                          onWishlist: () => void toggleWishlist(),
                          wishlistFilled: Boolean(localWishlistMap[selectedCard.masterCardId]),
                          wishPending,
                        }
                      : null
                  }
                />
                <ModalCarouselSlide
                  card={modalAdjacentCards.next}
                  slotWidth={carouselSlideWidth}
                  showMeta={false}
                  setLogosByCode={setLogosByCode}
                />
              </div>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-6 rounded-xl border border-white/15 bg-black/35 p-4 pt-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:gap-8 sm:p-5 sm:pt-5 md:sticky md:top-6 md:self-start md:p-5">
            <>
              <ModalYourCollectionSection
                lines={collectionLinesForSelected}
                variant={variant}
                customerLoggedIn={
                  customerLoggedIn || variant === "collection" || variant === "wishlist"
                }
                masterCardId={selectedCard.masterCardId}
                onAdjustQuantity={
                  customerLoggedIn && selectedCard.masterCardId
                    ? adjustCollectionQuantity
                    : undefined
                }
                adjustingEntryId={adjustingCollectionEntryId}
              />
              <ModalCardPricing
                key={selectedCard.masterCardId ?? `${selectedCard.set}/${selectedCard.filename}`}
                externalId={selectedCard.externalId}
                ebayCardContext={{
                  setName: selectedCard.setName,
                  setSlug: selectedCard.setSlug,
                  setTcgdexId: selectedCard.setTcgdexId,
                  setCardCountOfficial: selectedCard.setCardCountOfficial,
                  setCode: selectedCard.set,
                  cardName: selectedCard.cardName,
                  cardNumber: selectedCard.cardNumber,
                  cardmarketListingVersion: selectedCard.cardmarketListingVersion,
                }}
              />
            </>
            <section className="flex flex-col gap-2">
              <h4 className="text-base font-bold tracking-tight text-white">Attributes</h4>
              <div className="flex flex-col gap-2">
                <ModalAttributeRow
                  icon={<AttributeIconIllustrator />}
                  label="Illustrator"
                  value={selectedCard.artist ?? ""}
                />
                <ModalAttributeRow
                  icon={<AttributeIconCalendar />}
                  label="Release date"
                  value={formatSetReleaseDate(selectedCard.setReleaseDate)}
                />
                <ModalAttributeRow
                  icon={<AttributeIconStar />}
                  label="Rarity"
                  value={selectedCard.rarity ?? ""}
                />
                <ModalAttributeRow
                  icon={<AttributeIconHash />}
                  label="National Dex ID"
                  value={
                    modalNationalDexIds && modalNationalDexIds.length > 0
                      ? modalNationalDexIds.join(", ")
                      : ""
                  }
                />
                <ModalAttributeRow
                  icon={<AttributeIconBolt />}
                  label="Energy type"
                  value={
                    selectedCard.elementTypes && selectedCard.elementTypes.length > 0
                      ? selectedCard.elementTypes.join(", ")
                      : ""
                  }
                />
                <ModalAttributeRow
                  icon={<AttributeIconBadge />}
                  label="Regulation mark"
                  value={selectedCard.regulationMark ?? ""}
                />
                {selectedCard.category ? (
                  <ModalAttributeRow
                    icon={<AttributeIconLayers />}
                    label="Category"
                    value={selectedCard.category}
                  />
                ) : null}
                {selectedCard.stage ? (
                  <ModalAttributeRow
                    icon={<AttributeIconBadge />}
                    label="Stage"
                    value={selectedCard.stage}
                  />
                ) : null}
                {typeof selectedCard.hp === "number" ? (
                  <ModalAttributeRow
                    icon={<AttributeIconHeart />}
                    label="HP"
                    value={String(selectedCard.hp)}
                  />
                ) : null}
              </div>
            </section>

            {modalNationalDexIds && modalNationalDexIds.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h4 className="text-base font-bold tracking-tight text-white">Other cards</h4>
                {nationalDexStripError ? (
                  <p className="text-xs text-white/55">
                    Could not load matching cards. Try again later.
                  </p>
                ) : nationalDexStripLoading ? (
                  <p className="text-xs text-white/55">Loading other printings…</p>
                ) : nationalDexStrip.length > 1 ? (
                  <p className="text-xs text-white/55">
                    Other printings in the catalog that share this National Dex ID (showing up to 500,
                    newest sets first).
                  </p>
                ) : (
                  <p className="text-xs text-white/55">Only this printing is catalogued for this Dex ID.</p>
                )}
                <div className="scrollbar-hide -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pt-1">
                  {nationalDexStripLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={`dex-skel-${i}`}
                          className="aspect-[3/4] w-[30vw] max-w-[132px] shrink-0 animate-pulse snap-start rounded-lg bg-white/10"
                          aria-hidden
                        />
                      ))
                    : nationalDexStrip.map((card) => {
                        const isCurrent = sameCardEntry(card, selectedCard);
                        return (
                          <button
                            key={`${card.set}/${card.filename}`}
                            type="button"
                            onClick={() => {
                              if (isCurrent) return;
                              const gi = normalizedCards.findIndex((c) => sameCardEntry(c, card));
                              if (gi >= 0) {
                                setStandaloneModalCard(null);
                                setSelectedIndex(gi);
                              } else {
                                setStandaloneModalCard(card);
                                setSelectedIndex(null);
                              }
                            }}
                            className={`relative aspect-[3/4] w-[30vw] max-w-[132px] shrink-0 snap-start overflow-hidden rounded-lg border bg-black/25 p-1.5 text-left transition ${
                              isCurrent
                                ? "border-white ring-2 ring-white/90"
                                : "border-white/20 hover:border-white/45"
                            }`}
                            aria-label={
                              isCurrent
                                ? `Current card: ${card.cardName || card.filename}`
                                : `View ${card.cardName || card.filename}`
                            }
                            aria-current={isCurrent ? "true" : undefined}
                          >
                            {isCurrent ? (
                              <span className="absolute left-1/2 top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                                  <path
                                    d="M20 6 9 17l-5-5"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </span>
                            ) : null}
                            <img
                              src={card.lowSrc}
                              alt=""
                              className={`h-full w-full object-contain ${isCurrent ? "opacity-55" : ""}`}
                              loading="lazy"
                            />
                            <span className="mt-1 block truncate px-0.5 text-center text-[10px] text-white/65">
                              {card.setName || card.set}
                            </span>
                          </button>
                        );
                      })}
                </div>
              </section>
            ) : (
              <p className="text-sm text-white/55">
                No National Dex ID is stored for this card, so other printings cannot be matched here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const addSheet =
    addSheetOpen &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 z-[10001] flex flex-col justify-end bg-black/60"
        onClick={() => setAddSheetOpen(false)}
        role="presentation"
      >
        <div
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 text-[var(--foreground)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Add to collection"
        >
          <h2 className="text-lg font-semibold">Add to collection</h2>
          <p className="mt-1 text-sm text-[var(--foreground)]/65">{selectedCard?.cardName}</p>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Condition</span>
              <select
                value={addConditionId}
                onChange={(e) => setAddConditionId(e.target.value)}
                className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2"
              >
                <option value="">— Optional —</option>
                {itemConditions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Quantity</span>
              <input
                type="number"
                min={1}
                value={addQuantity}
                onChange={(e) => setAddQuantity(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Printing</span>
              <select
                value={addPrinting}
                onChange={(e) => setAddPrinting(e.target.value)}
                className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2"
              >
                {PRINTING_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setAddSheetOpen(false)}
              className="flex-1 rounded-md border border-[var(--foreground)]/25 px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={addPending}
              onClick={() => void submitAddCollection()}
              className="flex-1 rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {addPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3 md:grid-cols-8 lg:grid-cols-8">
        {normalizedCards.map((card, index) => {
          return (
            <li
              key={card.masterCardId ?? `${card.set}/${card.filename}/${index}`}
              className="card-grid-item group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 shadow-sm transition hover:border-[var(--foreground)]/20 hover:shadow-md"
            >
              {variant === "collection" && (card.quantity ?? 1) > 1 ? (
                <span className="pointer-events-none absolute left-1 top-1 z-[5] rounded bg-[var(--foreground)]/85 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[var(--background)]">
                  ×{card.quantity}
                </span>
              ) : null}
              <div className="pointer-events-none absolute inset-0">
                <img
                  src={card.lowSrc}
                  alt={`${card.set} ${card.filename}`}
                  className="h-full w-full object-cover object-center"
                  loading={index < 12 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={index < 6 ? "high" : "auto"}
                />
                <span className="absolute bottom-0 left-0 right-0 bg-[var(--foreground)]/80 px-1 py-0.5 text-center text-xs text-[var(--background)] opacity-0 transition group-hover:opacity-100">
                  {card.set} / {card.filename.replace(/\.[^.]+$/, "")}
                </span>
              </div>
              <button
                type="button"
                className="absolute inset-0 z-10 cursor-pointer border-0 bg-transparent p-0"
                onClick={() => openModal(index)}
                aria-label={`View ${card.set} ${card.filename}`}
              />
            </li>
          );
        })}
      </ul>
      {modal && createPortal(modal, document.body)}
      {addSheet}
    </>
  );
}
