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
  return [card.cardNumber, card.variant ?? "normal", card.tcgplayerProductId ?? ""].join("|");
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
              className="card-viewer-overlay fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="onepiece-card-title"
              onClick={() => setDetailCard(null)}
            >
              <button
                type="button"
                aria-label="Close"
                className="card-viewer-icon-button absolute right-4 top-[max(1rem,env(safe-area-inset-top))] inline-flex h-11 w-11 items-center justify-center border border-white/15 bg-white/10 text-white backdrop-blur-xl transition hover:bg-white/18 sm:right-6 sm:top-6"
                onClick={() => setDetailCard(null)}
              >
                <DrawerIconClose />
              </button>
              <div
                className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.25rem] border border-white/12 bg-[#0c0d10]/92 p-5 shadow-2xl backdrop-blur-2xl sm:rounded-[1.5rem]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="relative mx-auto aspect-[63/88] w-[min(100%,220px)] shrink-0 overflow-hidden rounded-2xl bg-black/30 sm:mx-0">
                    {onePiecePublicAssetUrl(mediaBaseUrl, detailCard.imagePath) ? (
                      <NextImage
                        src={onePiecePublicAssetUrl(mediaBaseUrl, detailCard.imagePath)}
                        alt=""
                        fill
                        className="object-contain"
                        sizes="220px"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <h2 id="onepiece-card-title" className="text-lg font-bold text-[var(--foreground)]">
                      {detailCard.name}
                    </h2>
                    <p className="text-sm text-[var(--foreground)]/60">
                      {detailCard.cardNumber}
                      {detailCard.variant && detailCard.variant !== "normal" ? ` · ${detailCard.variant}` : ""} ·{" "}
                      {detailCard.rarity}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--foreground)]/75">
                      {detailCard.cardType?.length ? (
                        <>
                          <dt className="text-[var(--foreground)]/45">Type</dt>
                          <dd>{detailCard.cardType.join(", ")}</dd>
                        </>
                      ) : null}
                      {detailCard.color?.length ? (
                        <>
                          <dt className="text-[var(--foreground)]/45">Color</dt>
                          <dd>{detailCard.color.join(" / ")}</dd>
                        </>
                      ) : null}
                      {detailCard.cost != null ? (
                        <>
                          <dt className="text-[var(--foreground)]/45">Cost</dt>
                          <dd>{detailCard.cost}</dd>
                        </>
                      ) : null}
                      {detailCard.power != null ? (
                        <>
                          <dt className="text-[var(--foreground)]/45">Power</dt>
                          <dd>{detailCard.power}</dd>
                        </>
                      ) : null}
                      {detailCard.life != null ? (
                        <>
                          <dt className="text-[var(--foreground)]/45">Life</dt>
                          <dd>{detailCard.life}</dd>
                        </>
                      ) : null}
                    </dl>
                    {detailCard.effect ? (
                      <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-relaxed text-[var(--foreground)]/85">
                        {detailCard.effect}
                      </p>
                    ) : null}
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
