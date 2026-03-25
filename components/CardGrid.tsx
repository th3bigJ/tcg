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
import type { CollectionLineSummary } from "@/lib/storefrontCardMaps";

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

function readUsdLowHigh(block: unknown): { low: number | null; high: number | null } {
  if (!block || typeof block !== "object") return { low: null, high: null };
  const o = block as Record<string, unknown>;
  const low = typeof o.low === "number" && Number.isFinite(o.low) ? o.low : null;
  const high = typeof o.high === "number" && Number.isFinite(o.high) ? o.high : null;
  return { low, high };
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
  masterCardId,
  externalId,
  legacyExternalId,
  ebayCardContext,
  onVariantsLoaded,
}: {
  /** When set, pricing loads via indexed `catalog_card_pricing.master_card_id` (fast). */
  masterCardId?: string;
  externalId?: string;
  legacyExternalId?: string;
  ebayCardContext: EbayPokemonCardSearchParts;
  /** Called once pricing loads, with ordered variant keys that have a raw price. */
  onVariantsLoaded?: (variants: string[]) => void;
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
                .filter(([, block]) => readUsdMarket(block) !== null)
                .map(([k]) => k)
            : [];
          cb(keys);
        }
      } catch {
        if (!cancelled) {
          setPayload({ tcgplayer: null, cardmarket: null });
          onVariantsLoadedRef.current?.([]);
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
  const tpObj =
    tpRoot && typeof tpRoot === "object" ? (tpRoot as Record<string, unknown>) : null;

  /** All variant keys that have at least a raw price. */
  const variantRows = useMemo(() => {
    if (!tpObj) return [];
    return Object.entries(tpObj)
      .filter(([, block]) => readUsdMarket(block) !== null)
      .map(([key, block]) => ({
        key,
        raw: readUsdMarket(block)!,
        psa10: readPsa10(block),
      }));
  }, [tpObj]);

  const pricingResolved = !showDexRows || pricingLoaded;

  if (!pricingResolved) {
    if (!showDexRows && !ebayUrl) return null;
    return (
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold tracking-tight text-white">Market prices</h4>
        <div className="flex flex-col gap-2">
          {showDexRows ? (
            <div className="h-[52px] animate-pulse rounded-2xl bg-white/10" />
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

  if (!showDexRows && !ebayUrl) return null;

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-bold tracking-tight text-white">Market prices</h4>
      <div className="flex flex-col gap-2">
        {showDexRows
          ? variantRows.map(({ key, raw, psa10 }) => (
              <div
                key={key}
                className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-sm font-medium text-white">
                  {variantLabel(key)}
                </span>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-sm font-semibold tabular-nums text-white">
                    {formatMoneyGbp(raw)}
                  </span>
                  {psa10 !== null ? (
                    <span className="text-xs tabular-nums text-white/60">
                      PSA 10 {formatMoneyGbp(psa10)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          : null}
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

function ModalCardHeadline({
  card,
  setLogosByCode,
  primaryActions,
}: {
  card: CardEntry;
  setLogosByCode?: Record<string, string>;
  primaryActions?: ModalPrimaryActions | null;
}) {
  const modalSetLogoSrc = card.setLogoSrc || setLogosByCode?.[card.set] || "";
  const modalSetLabel = card.setName || card.set;
  const showSideActions = Boolean(primaryActions && card.masterCardId);

  const titleAndSet = (
    <>
      <h3 className="text-balance break-words text-center text-xl font-bold leading-tight md:text-xl">
        {card.cardName || "Unknown card"}
      </h3>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm leading-snug text-white/75 md:mt-1.5 md:justify-center">
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
      <div className="w-full min-w-0 max-w-full px-3 py-4 text-white sm:px-5 md:px-0 md:py-0">
        <div className="mx-auto flex w-full min-w-0 max-w-full items-center gap-2 overflow-x-hidden sm:gap-3 sm:px-2 md:max-w-none md:items-center md:gap-3 md:overflow-visible md:px-0">
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
    <div className="w-full px-1 py-4 text-center text-white md:px-0 md:py-0 md:text-left">
      {titleAndSet}
    </div>
  );
}

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
      className="flex shrink-0 flex-col items-center gap-3 md:h-full md:min-h-0 md:gap-2"
      style={{ width: w, minWidth: w, maxWidth: w }}
    >
      <div className="relative flex min-h-[50vh] w-full items-end justify-center pb-0 sm:min-h-[50vh] md:min-h-0 md:max-h-[min(78vh,calc(100dvh-8.5rem))] md:flex-1 md:items-center md:justify-center md:pb-0">
        {card ? (
          <img
            src={card.highSrc || card.lowSrc || ""}
            alt={`${card.set} ${card.filename}`}
            className="block max-h-[min(64vh,640px)] w-auto max-w-full rounded-[var(--card-viewer-image-radius)] object-contain shadow-2xl md:mx-auto md:max-h-full md:max-w-full md:self-center"
            draggable={false}
          />
        ) : (
          <div
            className="aspect-[3/4] max-h-[min(64vh,640px)] w-[min(85%,240px)] rounded-[var(--card-viewer-image-radius)] bg-white/[0.06] md:mx-auto md:max-h-full md:max-w-full md:self-center"
            aria-hidden
          />
        )}
      </div>
      {showMeta && card ? (
        <div className="w-full min-w-0 max-w-full md:hidden">
          <ModalCardHeadline card={card} setLogosByCode={setLogosByCode} primaryActions={primaryActions} />
        </div>
      ) : null}
    </div>
  );
}

function ModalDexOtherCardsSection({
  variant,
  nationalDexStrip,
  nationalDexStripLoading,
  nationalDexStripError,
  selectedCard,
  normalizedCards,
  setSelectedIndex,
  setStandaloneModalCard,
}: {
  variant: "mobile" | "desktop";
  nationalDexStrip: CardEntry[];
  nationalDexStripLoading: boolean;
  nationalDexStripError: boolean;
  selectedCard: CardEntry;
  normalizedCards: CardEntry[];
  setSelectedIndex: (index: number | null) => void;
  setStandaloneModalCard: (card: CardEntry | null) => void;
}) {
  const isDesktop = variant === "desktop";
  const outer =
    isDesktop
      ? "hidden min-h-0 w-full shrink-0 flex-col items-center gap-1.5 pt-2 md:flex"
      : "flex flex-col gap-3 md:hidden";
  const titleClass = isDesktop
    ? "text-xs font-bold tracking-tight text-white"
    : "text-base font-bold tracking-tight text-white";
  const hintClass = isDesktop ? "text-[10px] leading-snug text-white/55" : "text-xs text-white/55";
  /* Desktop: scroll outer; inner row centers when shorter than full width (min-w-full + justify-center). */
  /* @container so thumb width stays “5 per strip viewport” even with inner centered row. */
  /* overflow-x-auto forces overflow-y to compute to auto; extra py keeps rounded thumbs inside the scrollport. */
  const scrollOuterClass = isDesktop
    ? "@container/strip scrollbar-hide w-full snap-x snap-mandatory overflow-x-auto py-2"
    : "scrollbar-hide -mx-1 w-full snap-x snap-mandatory overflow-x-auto py-2";
  const scrollInnerClass = isDesktop ? "flex min-w-full justify-center gap-2" : "flex gap-3";
  /* Desktop: 5 thumbs across strip (4× gap-2); cqw = @container/strip width. */
  const skelClass = isDesktop
    ? "aspect-[3/4] w-[calc((100cqw-2rem)/5)] max-w-none shrink-0 animate-pulse snap-start rounded-[var(--card-viewer-image-radius)] bg-white/10"
    : "aspect-[3/4] w-[36vw] max-w-[168px] shrink-0 animate-pulse snap-start rounded-[var(--card-viewer-image-radius)] bg-white/10";
  const btnClass = (isCurrent: boolean) =>
    isDesktop
      ? `relative flex aspect-[3/4] w-[calc((100cqw-2rem)/5)] max-w-none shrink-0 snap-start items-center justify-center border-0 bg-transparent p-0 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
          isCurrent ? "opacity-100" : "opacity-55 hover:opacity-90"
        }`
      : `relative flex w-[36vw] max-w-[168px] shrink-0 snap-start flex-col items-stretch border-0 bg-transparent p-0 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
          isCurrent ? "opacity-100" : "opacity-60 hover:opacity-90"
        }`;

  const stripItems = nationalDexStripLoading ? (
    Array.from({ length: isDesktop ? 5 : 6 }).map((_, i) => (
      <div key={`dex-skel-${variant}-${i}`} className={skelClass} aria-hidden />
    ))
  ) : (
    nationalDexStrip.map((card) => {
      const isCurrent = sameCardEntry(card, selectedCard);
      return (
        <button
          key={`${card.set}/${card.filename}-${variant}`}
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
          className={btnClass(isCurrent)}
          aria-label={
            isCurrent
              ? `Current card: ${card.cardName || card.filename}`
              : `View ${card.cardName || card.filename}`
          }
          aria-current={isCurrent ? "true" : undefined}
        >
          {isDesktop ? (
            <img
              src={card.lowSrc}
              alt=""
              className="block max-h-full max-w-full rounded-[var(--card-viewer-image-radius)] object-contain"
              loading="lazy"
            />
          ) : (
            <span className="relative block aspect-[3/4] w-full shrink-0 overflow-hidden rounded-[var(--card-viewer-image-radius)]">
              <img
                src={card.lowSrc}
                alt=""
                className="absolute inset-0 block h-full w-full object-contain"
                loading="lazy"
              />
            </span>
          )}
          {!isDesktop ? (
            <span className="mt-1 block w-full truncate text-center text-[10px] text-white/65">
              {card.setName || card.set}
            </span>
          ) : null}
        </button>
      );
    })
  );

  return (
    <section className={outer}>
      <h4 className={titleClass}>Other cards</h4>
      {nationalDexStripError ? (
        <p className={hintClass}>Could not load matching cards. Try again later.</p>
      ) : nationalDexStripLoading ? (
        <p className={hintClass}>Loading other printings…</p>
      ) : nationalDexStrip.length <= 1 ? (
        <p className={hintClass}>Only this printing is catalogued for this Dex ID.</p>
      ) : null}
      <div className={scrollOuterClass}>
        <div className={scrollInnerClass}>{stripItems}</div>
      </div>
    </section>
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
    <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-3 md:gap-2 md:px-2.5 md:py-2">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-white/50 md:text-[10px]">{label}</div>
        <div className="mt-0.5 text-sm font-medium leading-snug text-white md:text-xs">{display}</div>
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
  cardPricesByMasterCardId = {},
}: {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  variant?: "browse" | "collection" | "wishlist";
  customerLoggedIn?: boolean;
  itemConditions?: { id: string; name: string }[];
  wishlistEntryIdsByMasterCardId?: Record<string, string>;
  collectionLinesByMasterCardId?: Record<string, CollectionLineSummary[]>;
  cardPricesByMasterCardId?: Record<string, number>;
}) {
  const router = useRouter();
  const [localWishlistMap, setLocalWishlistMap] = useState(wishlistEntryIdsByMasterCardId);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addConditionId, setAddConditionId] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [addPrinting, setAddPrinting] = useState<string>("Standard");
  const [addPending, setAddPending] = useState(false);
  const [wishPending, setWishPending] = useState(false);
  const [wishSheetOpen, setWishSheetOpen] = useState(false);
  const [wishVariant, setWishVariant] = useState<string>("");
  /** Pricing variant keys loaded for the currently selected card (from ModalCardPricing). */
  const [pricingVariants, setPricingVariants] = useState<string[]>([]);
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

  // Reset pricing variants when the selected card changes
  useEffect(() => {
    setPricingVariants([]);
  }, [selectedCard?.masterCardId]);

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
    setAddPrinting(pricingVariants[0] ?? "Standard");
    setAddSheetOpen(true);
  }, [customerLoggedIn, goLogin, itemConditions, pricingVariants, selectedCard?.masterCardId]);

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
      let j: { doc?: { id?: string | number } };
      try {
        j = (await res.json()) as { doc?: { id?: string | number } };
      } catch {
        return;
      }
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
    } catch {
      /* Network / aborted fetch — WebKit reports TypeError: Load failed */
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
      } catch {
        /* Network / aborted fetch */
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
    if (existingId) {
      // Already wishlisted — remove immediately
      setWishPending(true);
      try {
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
      } catch {
        /* Network / aborted fetch */
      } finally {
        setWishPending(false);
      }
    } else {
      // Open sheet to pick variant before adding
      setWishVariant(pricingVariants[0] ?? "");
      setWishSheetOpen(true);
    }
  }, [customerLoggedIn, goLogin, localWishlistMap, pricingVariants, router, selectedCard?.masterCardId]);

  const submitAddWishlist = useCallback(async () => {
    if (!selectedCard?.masterCardId) return;
    const mid = selectedCard.masterCardId;
    setWishPending(true);
    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterCardId: mid,
          targetPrinting: wishVariant || undefined,
        }),
      });
      if (res.ok) {
        let j: { doc?: { id?: string | number } };
        try {
          j = (await res.json()) as { doc?: { id?: string | number } };
        } catch {
          j = {};
        }
        const wid = j.doc?.id;
        if (wid !== undefined) {
          setLocalWishlistMap((m) => ({ ...m, [mid]: String(wid) }));
        }
        router.refresh();
      }
    } catch {
      /* Network / aborted fetch */
    } finally {
      setWishPending(false);
      setWishSheetOpen(false);
    }
  }, [router, selectedCard?.masterCardId, wishVariant]);

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

    const loadDexStrip = async () => {
      try {
        const res = await fetch(
          `/api/cards/by-national-dex?ids=${encodeURIComponent(nationalDexFetchKey)}`,
        );
        if (cancelled) return;
        if (!res.ok) throw new Error("request failed");
        let data: { cards?: CardEntry[] };
        try {
          data = (await res.json()) as { cards?: CardEntry[] };
        } catch {
          throw new Error("json");
        }
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
      } catch {
        if (!cancelled) {
          setNationalDexStrip([]);
          setNationalDexStripError(true);
        }
      } finally {
        if (!cancelled) setNationalDexStripLoading(false);
      }
    };

    void loadDexStrip();

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
      className="card-viewer-overlay fixed inset-0 z-[9999] overflow-x-hidden overflow-y-auto overscroll-y-contain md:overflow-hidden"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label="Card preview"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          closeModal();
        }}
        className="card-viewer-icon-button fixed right-[max(1rem,env(safe-area-inset-right,0px))] top-[max(1rem,env(safe-area-inset-top,0px))] z-[10000] hidden h-11 w-11 items-center justify-center border border-white/60 bg-black/75 text-white transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:h-12 sm:w-12 md:inline-flex"
        aria-label="Close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!hasPrevious) return;
          viewPrevious();
        }}
        aria-label="Previous card"
        aria-disabled={!hasPrevious}
        tabIndex={hasPrevious ? 0 : -1}
        className={`card-viewer-icon-button fixed left-[max(0.75rem,env(safe-area-inset-left,0px))] top-1/2 z-[10000] hidden h-11 w-11 -translate-y-1/2 items-center justify-center border border-white/60 bg-black/75 text-white transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:left-[max(1rem,env(safe-area-inset-left,0px))] sm:h-12 sm:w-12 md:inline-flex ${!hasPrevious ? "cursor-not-allowed opacity-35" : ""}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!hasNext) return;
          viewNext();
        }}
        aria-label="Next card"
        aria-disabled={!hasNext}
        tabIndex={hasNext ? 0 : -1}
        className={`card-viewer-icon-button fixed right-[max(0.75rem,env(safe-area-inset-right,0px))] top-1/2 z-[10000] hidden h-11 w-11 -translate-y-1/2 items-center justify-center border border-white/60 bg-black/75 text-white transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:right-[max(1rem,env(safe-area-inset-right,0px))] sm:h-12 sm:w-12 md:inline-flex ${!hasNext ? "cursor-not-allowed opacity-35" : ""}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      <div
        className="relative mx-auto flex min-h-[100dvh] w-full min-w-0 max-w-[1460px] flex-col overflow-x-hidden px-3 pb-14 pt-4 sm:px-6 md:h-[100dvh] md:max-h-[100dvh] md:min-h-0 md:overflow-hidden md:px-8 md:pb-5 md:pt-6"
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

        <div className="grid w-full min-w-0 max-w-full gap-3 md:grid-cols-[1fr_minmax(16rem,24rem)_minmax(11rem,16rem)] md:flex-1 md:min-h-0 md:items-stretch md:gap-4 md:overflow-hidden">
          <div
            ref={leftColumnRef}
            className="flex w-full min-w-0 max-w-full flex-col items-center gap-3 overflow-x-hidden md:min-h-0 md:items-stretch md:gap-2 md:self-stretch"
          >
            {/* Keep the swipe track clipped to the carousel column on all breakpoints. */}
            <div className="w-full min-w-0 max-w-full overflow-x-hidden md:flex md:min-h-0 md:flex-1 md:flex-col">
              <div
                className="card-viewer-swipe-group flex will-change-transform md:min-h-0 md:flex-1 md:items-stretch"
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
            {modalNationalDexIds && modalNationalDexIds.length > 0 ? (
              <ModalDexOtherCardsSection
                variant="desktop"
                nationalDexStrip={nationalDexStrip}
                nationalDexStripLoading={nationalDexStripLoading}
                nationalDexStripError={nationalDexStripError}
                selectedCard={selectedCard}
                normalizedCards={normalizedCards}
                setSelectedIndex={setSelectedIndex}
                setStandaloneModalCard={setStandaloneModalCard}
              />
            ) : null}
          </div>

          <div className="col-span-1 flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden rounded-xl border border-white/15 bg-black/35 p-4 pt-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:gap-8 sm:p-5 sm:pt-5 md:contents md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
            <div className="flex w-full min-w-0 flex-col gap-6 sm:gap-8 md:min-h-0 md:gap-3 md:overflow-y-auto md:rounded-xl md:border md:border-white/15 md:bg-black/35 md:p-4 md:shadow-[0_20px_60px_rgba(0,0,0,0.45)] md:backdrop-blur-md">
              <div className="hidden md:block">
                <ModalCardHeadline
                  card={selectedCard}
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
              </div>
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
                masterCardId={selectedCard.masterCardId}
                externalId={selectedCard.externalId}
                legacyExternalId={selectedCard.legacyExternalId}
                onVariantsLoaded={setPricingVariants}
                ebayCardContext={{
                  setName: selectedCard.setName,
                  setSlug: selectedCard.setSlug,
                  setTcgdexId: selectedCard.setTcgdexId,
                  setCardCountOfficial: selectedCard.setCardCountOfficial,
                  setCode: selectedCard.set,
                  cardName: selectedCard.cardName,
                  cardNumber: selectedCard.cardNumber,
                }}
              />
            </div>

            <div className="flex w-full min-w-0 flex-col gap-6 sm:gap-8 md:min-h-0 md:gap-2 md:overflow-y-auto md:rounded-xl md:border md:border-white/15 md:bg-black/35 md:p-4 md:shadow-[0_20px_60px_rgba(0,0,0,0.45)] md:backdrop-blur-md">
              <section className="flex flex-col gap-2">
                <h4 className="text-base font-bold tracking-tight text-white md:text-sm">Attributes</h4>
                <div className="flex flex-col gap-2 md:gap-1.5">
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
                <ModalDexOtherCardsSection
                  variant="mobile"
                  nationalDexStrip={nationalDexStrip}
                  nationalDexStripLoading={nationalDexStripLoading}
                  nationalDexStripError={nationalDexStripError}
                  selectedCard={selectedCard}
                  normalizedCards={normalizedCards}
                  setSelectedIndex={setSelectedIndex}
                  setStandaloneModalCard={setStandaloneModalCard}
                />
              ) : (
                <p className="text-sm text-white/55">
                  No National Dex ID is stored for this card, so other printings cannot be matched here.
                </p>
              )}
            </div>
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
              <span className="font-medium">Version</span>
              <select
                value={addPrinting}
                onChange={(e) => setAddPrinting(e.target.value)}
                className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2"
              >
                {pricingVariants.length > 0
                  ? pricingVariants.map((v) => (
                      <option key={v} value={v}>
                        {variantLabel(v)}
                      </option>
                    ))
                  : PRINTING_OPTIONS.map((p) => (
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

  const wishSheet =
    wishSheetOpen &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 z-[10001] flex flex-col justify-end bg-black/60"
        onClick={() => setWishSheetOpen(false)}
        role="presentation"
      >
        <div
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 text-[var(--foreground)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Add to wishlist"
        >
          <h2 className="text-lg font-semibold">Add to wishlist</h2>
          <p className="mt-1 text-sm text-[var(--foreground)]/65">{selectedCard?.cardName}</p>
          {pricingVariants.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Version</span>
                <select
                  value={wishVariant}
                  onChange={(e) => setWishVariant(e.target.value)}
                  className="rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2"
                >
                  {pricingVariants.map((v) => (
                    <option key={v} value={v}>
                      {variantLabel(v)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setWishSheetOpen(false)}
              className="flex-1 rounded-md border border-[var(--foreground)]/25 px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={wishPending}
              onClick={() => void submitAddWishlist()}
              className="flex-1 rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {wishPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-5 md:gap-3 lg:grid-cols-7">
        {normalizedCards.map((card, index) => {
          const showPrice = (variant === "collection" || variant === "wishlist") && card.masterCardId && cardPricesByMasterCardId[card.masterCardId] !== undefined;
          const unitPrice = showPrice && card.masterCardId ? cardPricesByMasterCardId[card.masterCardId] : null;
          return (
            <li
              key={card.masterCardId ?? `${card.set}/${card.filename}/${index}`}
              className="card-grid-item flex flex-col"
            >
              <div className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 shadow-sm transition hover:border-[var(--foreground)]/20 hover:shadow-md">
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
              </div>
              {unitPrice !== null ? (
                <span className="mt-1 text-center text-[10px] font-medium tabular-nums text-[var(--foreground)]/70">
                  {formatMoneyGbp(unitPrice)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {modal && createPortal(modal, document.body)}
      {addSheet}
      {wishSheet}
    </>
  );
}
