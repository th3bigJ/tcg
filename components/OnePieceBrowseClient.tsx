"use client";

import NextImage from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { useCardGridPreferences } from "@/components/CardGridPreferencesProvider";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { ModalCardPricing } from "@/components/card-grid/ModalCardPricing";
import type { OnePieceCardRecord, OnePieceSetRecord } from "@/lib/onepieceBrowse";
import { onePiecePublicAssetUrl } from "@/lib/onepieceBrowse";

const LOAD_MORE_STEP = 60;
const INITIAL_VISIBLE = 72;

type Props = {
  sets: OnePieceSetRecord[];
  mediaBaseUrl: string;
  initialSetCode: string;
  initialCards: OnePieceCardRecord[];
  errorMessage: string | null;
};

function cardStableId(card: OnePieceCardRecord): string {
  return [card.cardNumber, card.variant ?? "normal", onePieceLookupId(card)].join("|");
}

function onePieceLookupId(card: OnePieceCardRecord): string {
  const direct = card.priceKey?.trim();
  if (direct) return direct;

  const legacy = card.tcgplayerProductId?.trim();
  if (legacy) return legacy;

  const setCode = card.setCode?.trim().toUpperCase();
  const cardNumber = card.cardNumber?.trim().toUpperCase();
  const variant = card.variant?.trim() || "normal";
  if (!setCode || !cardNumber) return "";
  return `${setCode}::${cardNumber}::${variant}`;
}

function buildOnePieceEbaySearchQuery(card: OnePieceCardRecord, setName?: string | null): string {
  const segments = ["One Piece", setName?.trim() ?? "", card.name.trim(), card.cardNumber.trim()].filter(Boolean);
  return segments.join(" ");
}

function DrawerIconClose() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function OnePieceBrowseClient({
  sets,
  mediaBaseUrl,
  initialSetCode,
  initialCards,
  errorMessage,
}: Props) {
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { preferences: gridPreferences } = useCardGridPreferences();
  const gridColumnStyle = useMemo(
    () =>
      ({
        ["--card-grid-cols-mobile" as string]: String(gridPreferences.gridColumnsMobile),
        ["--card-grid-cols-desktop" as string]: String(gridPreferences.gridColumnsDesktop),
      }) as CSSProperties,
    [gridPreferences.gridColumnsDesktop, gridPreferences.gridColumnsMobile],
  );

  const setOptions = useMemo(() => {
    const sorted = [...sets].sort((a, b) => {
      const da = (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "");
      return -da;
    });
    return sorted;
  }, [sets]);

  const [selectedSet, setSelectedSet] = useState(initialSetCode);
  const [cards, setCards] = useState<OnePieceCardRecord[]>(initialCards);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(INITIAL_VISIBLE, initialCards.length || INITIAL_VISIBLE),
  );
  const [detailCard, setDetailCard] = useState<OnePieceCardRecord | null>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);

  const cardsUrlForSet = useCallback(
    (code: string) => `${mediaBaseUrl.replace(/\/+$/, "")}/onepiece/cards/data/${code.toUpperCase()}.json`,
    [mediaBaseUrl],
  );

  const syncUrlSetParam = useCallback((code: string) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("set", code);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/onepiece?${qs}` : "/onepiece");
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (selectedSet.toUpperCase() === initialSetCode.toUpperCase()) {
      setCards(initialCards);
      setLoadError(null);
      setListBusy(false);
      setVisibleCount(Math.min(INITIAL_VISIBLE, initialCards.length));
      return;
    }

    (async () => {
      setListBusy(true);
      setLoadError(null);
      try {
        const res = await fetch(cardsUrlForSet(selectedSet), { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setCards([]);
          setVisibleCount(INITIAL_VISIBLE);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        const next = Array.isArray(data) ? (data as OnePieceCardRecord[]) : [];
        if (!cancelled) {
          setCards(next);
          setVisibleCount(Math.min(INITIAL_VISIBLE, next.length));
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Could not load cards.");
          setCards([]);
        }
      } finally {
        if (!cancelled) setListBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardsUrlForSet, initialCards, initialSetCode, selectedSet]);

  const rarityOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) {
      if (c.rarity?.trim()) s.add(c.rarity.trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    const r = rarityFilter.trim();
    return cards.filter((c) => {
      if (r && c.rarity !== r) return false;
      if (!q) return true;
      const num = (c.cardNumber ?? "").toLowerCase();
      const name = (c.name ?? "").toLowerCase();
      return num.includes(q) || name.includes(q);
    });
  }, [cards, rarityFilter, search]);

  useEffect(() => {
    setVisibleCount((v) => Math.min(v, filteredCards.length));
  }, [filteredCards.length, search, rarityFilter]);

  const visibleCards = useMemo(() => {
    const cap = Math.min(filteredCards.length, visibleCount);
    return filteredCards.slice(0, cap);
  }, [filteredCards, visibleCount]);

  const canLoadMore = visibleCount < filteredCards.length;
  const scrollRestoreKey = `${selectedSet}|${filteredCards.length}|${search}|${rarityFilter}`;

  useEffect(() => {
    if (!canLoadMore) return;
    const button = loadMoreRef.current;
    if (!button) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((cur) => Math.min(filteredCards.length, cur + LOAD_MORE_STEP));
        }
      },
      { rootMargin: "0px 0px 200px 0px", threshold: 0 },
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [canLoadMore, filteredCards.length]);

  const onPickSet = (code: string) => {
    const upper = code.toUpperCase();
    setSelectedSet(upper);
    setSearch("");
    setRarityFilter("");
    setDetailCard(null);
    setVisibleCount(INITIAL_VISIBLE);
    syncUrlSetParam(upper);
  };

  const activeSetMeta = useMemo(
    () => setOptions.find((s) => s.setCode.toUpperCase() === selectedSet.toUpperCase()) ?? null,
    [setOptions, selectedSet],
  );

  const setLogoSrc = activeSetMeta?.imagePath ? onePiecePublicAssetUrl(mediaBaseUrl, activeSetMeta.imagePath) : "";

  if (errorMessage && !sets.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center text-[var(--foreground)]/80 backdrop-blur-xl">
        <p className="text-sm font-medium">{errorMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/45">Set</span>
            <select
              value={selectedSet}
              onChange={(e) => onPickSet(e.target.value)}
              disabled={listBusy || !setOptions.length}
              className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-[var(--foreground)]/25"
            >
              {setOptions.map((s) => (
                <option key={s.setCode} value={s.setCode.toUpperCase()}>
                  {s.setCode} — {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/45">Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or number…"
              className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-sm text-[var(--foreground)] backdrop-blur-xl placeholder:text-[var(--foreground)]/35 focus:outline-none focus:ring-2 focus:ring-[var(--foreground)]/25"
            />
          </label>
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/45">Rarity</span>
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value)}
              className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-sm text-[var(--foreground)] backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-[var(--foreground)]/25"
            >
              <option value="">All</option>
              {rarityOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeSetMeta ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5 backdrop-blur-xl">
            {setLogoSrc ? (
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-black/20">
                <NextImage src={setLogoSrc} alt="" fill className="object-contain p-1" sizes="44px" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-[var(--foreground)]">{activeSetMeta.name}</div>
              <div className="text-xs text-[var(--foreground)]/50">
                {activeSetMeta.cardCount != null ? `${activeSetMeta.cardCount} cards · ` : null}
                {filteredCards.length} showing
                {listBusy ? " · Loading…" : null}
              </div>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadError}</p>
        ) : null}
      </div>

      <CardsResultsScroll
        canLoadMore={false}
        loadMoreHref="/onepiece"
        loadMoreStep={LOAD_MORE_STEP}
        scrollRestoreKey={scrollRestoreKey}
      >
        <ul className="card-grid-columns-dynamic grid gap-2 md:gap-3" style={gridColumnStyle}>
          {visibleCards.map((card) => {
            const src = onePiecePublicAssetUrl(mediaBaseUrl, card.imagePath);
            const key = cardStableId(card);
            return (
              <li key={key} className="card-grid-item min-w-0">
                <button
                  type="button"
                  onClick={() => setDetailCard(card)}
                  className="group flex w-full flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 text-left shadow-sm backdrop-blur-xl transition hover:border-white/18 hover:bg-white/[0.07]"
                >
                  <div className="relative aspect-[63/88] w-full overflow-hidden rounded-xl bg-black/25">
                    {src ? (
                      <NextImage
                        src={src}
                        alt={card.name}
                        fill
                        className="object-contain transition-transform group-hover:scale-[1.02]"
                        sizes="(max-width: 768px) 33vw, 14vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-xs text-[var(--foreground)]/40">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 px-0.5 pb-1">
                    <div className="truncate text-[11px] font-medium leading-tight text-[var(--foreground)]/55">
                      {card.cardNumber}
                      {card.variant && card.variant !== "normal" ? ` · ${card.variant}` : ""}
                    </div>
                    <div className="truncate text-xs font-semibold leading-snug text-[var(--foreground)]">{card.name}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {canLoadMore ? (
          <div className="flex items-center justify-center pb-[var(--bottom-nav-offset,0px)] pt-6">
            <button
              ref={loadMoreRef}
              type="button"
              onClick={() =>
                setVisibleCount((c) => Math.min(filteredCards.length, c + LOAD_MORE_STEP))
              }
              className="rounded-xl border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium backdrop-blur-sm transition hover:bg-[var(--foreground)]/18"
            >
              Load {Math.min(LOAD_MORE_STEP, filteredCards.length - visibleCount)} more
            </button>
          </div>
        ) : null}

        {!listBusy && !visibleCards.length ? (
          <p className="py-12 text-center text-sm text-[var(--foreground)]/50">No cards match the current filters.</p>
        ) : null}
      </CardsResultsScroll>

      {hasMounted && detailCard
        ? createPortal(
            <div
              className="card-viewer-overlay fixed inset-0 z-[9999] overflow-x-hidden overflow-y-auto overscroll-y-contain md:overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="onepiece-card-title"
              onClick={() => setDetailCard(null)}
            >
              <button
                type="button"
                aria-label="Close"
                className="card-viewer-icon-button fixed right-[max(1rem,env(safe-area-inset-right,0px))] top-[max(1rem,env(safe-area-inset-top,0px))] z-[10000] inline-flex h-11 w-11 items-center justify-center border border-white/60 bg-black/75 text-white transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:h-12 sm:w-12"
                onClick={() => setDetailCard(null)}
              >
                <DrawerIconClose />
              </button>
              <div
                className="relative mx-auto flex min-h-[100dvh] w-full min-w-0 max-w-[1280px] flex-col overflow-x-hidden px-3 pb-14 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.75rem))] sm:px-6 md:h-[100dvh] md:max-h-[100dvh] md:min-h-0 md:overflow-hidden md:px-8 md:pb-5 md:pt-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="grid w-full min-w-0 max-w-full gap-3 md:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] md:flex-1 md:min-h-0 md:items-stretch md:gap-4 md:overflow-hidden">
                  <div className="flex min-w-0 flex-col gap-3 md:min-h-0">
                    <div className="flex w-full min-w-0 items-center justify-center rounded-xl border border-white/15 bg-black/35 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md md:min-h-0 md:flex-1">
                      <div className="relative aspect-[63/88] w-full max-w-[320px] overflow-hidden rounded-[1.5rem] bg-black/40">
                        {onePiecePublicAssetUrl(mediaBaseUrl, detailCard.imagePath) ? (
                          <NextImage
                            src={onePiecePublicAssetUrl(mediaBaseUrl, detailCard.imagePath)}
                            alt={detailCard.name}
                            fill
                            className="object-contain"
                            sizes="(max-width: 768px) 80vw, 320px"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-white/45">
                            No image available
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden rounded-xl border border-white/15 bg-black/35 p-4 pt-5 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:gap-8 sm:p-5 md:min-h-0 md:overflow-y-auto">
                    <div className="space-y-3">
                      <div>
                        <h2 id="onepiece-card-title" className="text-2xl font-bold tracking-tight text-white">
                          {detailCard.name}
                        </h2>
                        <p className="mt-1 text-sm text-white/65">
                          {detailCard.cardNumber}
                          {detailCard.variant && detailCard.variant !== "normal" ? ` · ${detailCard.variant}` : ""}
                          {detailCard.rarity ? ` · ${detailCard.rarity}` : ""}
                        </p>
                      </div>

                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {detailCard.cardType?.length ? (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                            <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Type</dt>
                            <dd className="mt-1 text-sm font-medium text-white">{detailCard.cardType.join(", ")}</dd>
                          </div>
                        ) : null}
                        {detailCard.color?.length ? (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                            <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Color</dt>
                            <dd className="mt-1 text-sm font-medium text-white">{detailCard.color.join(" / ")}</dd>
                          </div>
                        ) : null}
                        {detailCard.cost != null ? (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                            <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Cost</dt>
                            <dd className="mt-1 text-sm font-medium text-white">{detailCard.cost}</dd>
                          </div>
                        ) : null}
                        {detailCard.power != null ? (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                            <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Power</dt>
                            <dd className="mt-1 text-sm font-medium text-white">{detailCard.power}</dd>
                          </div>
                        ) : null}
                        {detailCard.life != null ? (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                            <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Life</dt>
                            <dd className="mt-1 text-sm font-medium text-white">{detailCard.life}</dd>
                          </div>
                        ) : null}
                        {detailCard.counter != null ? (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                            <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Counter</dt>
                            <dd className="mt-1 text-sm font-medium text-white">{detailCard.counter}</dd>
                          </div>
                        ) : null}
                      </dl>

                      {detailCard.attribute?.length ? (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Attribute</div>
                          <div className="mt-1 text-sm text-white/85">{detailCard.attribute.join(" / ")}</div>
                        </div>
                      ) : null}

                      {detailCard.subtypes?.length ? (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Subtype</div>
                          <div className="mt-1 text-sm text-white/85">{detailCard.subtypes.join(" · ")}</div>
                        </div>
                      ) : null}

                      {detailCard.effect ? (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Effect</div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/88">
                            {detailCard.effect}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {(() => {
                      const lookupId = onePieceLookupId(detailCard);
                      return (
                        <ModalCardPricing
                          externalId={lookupId}
                          pricingUrl={
                            lookupId
                              ? `/api/onepiece/card-prices/${encodeURIComponent(lookupId)}?set=${encodeURIComponent(detailCard.setCode)}&variant=${encodeURIComponent(detailCard.variant ?? "normal")}`
                              : null
                          }
                          historyUrl={
                            lookupId
                              ? `/api/onepiece/card-price-history/${encodeURIComponent(lookupId)}?set=${encodeURIComponent(detailCard.setCode)}&variant=${encodeURIComponent(detailCard.variant ?? "normal")}`
                              : null
                          }
                          ebaySearchQuery={buildOnePieceEbaySearchQuery(detailCard, activeSetMeta?.name)}
                        />
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
