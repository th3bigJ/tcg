"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";

export type CardEntry = {
  set: string;
  setName?: string;
  setLogoSrc?: string;
  setReleaseDate?: string;
  cardNumber?: string;
  filename: string;
  lowSrc?: string;
  highSrc?: string;
  src?: string;
  rarity?: string;
  cardName?: string;
  category?: string;
  stage?: string;
  hp?: number;
  elementTypes?: string[];
  dexIds?: number[];
  artist?: string;
  regulationMark?: string;
};

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
  return a.set === b.set && a.filename === b.filename;
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
}: {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
}) {
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

  const stripIndex =
    nationalDexStrip.length > 0 && selectedCard && !nationalDexStripLoading
      ? nationalDexStrip.findIndex((c) => sameCardEntry(c, selectedCard))
      : -1;

  const useNationalNav = stripIndex >= 0;

  const hasPrevious = useNationalNav
    ? stripIndex > 0
    : selectedIndex !== null && selectedIndex > 0;

  const hasNext = useNationalNav
    ? stripIndex < nationalDexStrip.length - 1
    : selectedIndex !== null && selectedIndex < normalizedCards.length - 1;

  const openModal = useCallback((index: number) => {
    setStandaloneModalCard(null);
    setSelectedIndex(index);
  }, []);

  const closeModal = useCallback(() => {
    setSelectedIndex(null);
    setStandaloneModalCard(null);
    setNationalDexStrip([]);
    setNationalDexStripLoading(false);
    setNationalDexStripError(false);
  }, []);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const axisLockRef = useRef<"none" | "h" | "v">("none");
  const swipeFromLeftColumnRef = useRef(false);
  const pendingNavRef = useRef<"next" | "prev" | null>(null);

  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [slideTransition, setSlideTransition] = useState(false);

  const leftColumnRef = useRef<HTMLDivElement>(null);
  /** Scroll container for the modal (`overflow-y-auto` overlay); swipe-down-to-close only when scrolled to top. */
  const modalScrollContainerRef = useRef<HTMLDivElement>(null);

  const viewPrevious = useCallback(() => {
    const idx = selectedIndexRef.current;
    const standalone = standaloneModalCardRef.current;
    const nc = normalizedCards;
    const strip = nationalDexStrip;
    const loading = nationalDexStripLoading;

    const current =
      standalone ?? (idx !== null ? (nc[idx] ?? null) : null);
    if (!current) return;

    const sIdx =
      !loading && strip.length > 0
        ? strip.findIndex((c) => sameCardEntry(c, current))
        : -1;

    if (sIdx > 0) {
      const prev = strip[sIdx - 1];
      const gi = nc.findIndex((c) => sameCardEntry(c, prev));
      if (gi >= 0) {
        setStandaloneModalCard(null);
        setSelectedIndex(gi);
      } else {
        setStandaloneModalCard(prev);
        setSelectedIndex(null);
      }
      return;
    }

    if (standalone === null && idx !== null && idx > 0) {
      setSelectedIndex(idx - 1);
    }
  }, [normalizedCards, nationalDexStrip, nationalDexStripLoading]);

  const viewNext = useCallback(() => {
    const idx = selectedIndexRef.current;
    const standalone = standaloneModalCardRef.current;
    const nc = normalizedCards;
    const strip = nationalDexStrip;
    const loading = nationalDexStripLoading;

    const current =
      standalone ?? (idx !== null ? (nc[idx] ?? null) : null);
    if (!current) return;

    const sIdx =
      !loading && strip.length > 0
        ? strip.findIndex((c) => sameCardEntry(c, current))
        : -1;

    if (sIdx >= 0 && sIdx < strip.length - 1) {
      const next = strip[sIdx + 1];
      const gi = nc.findIndex((c) => sameCardEntry(c, next));
      if (gi >= 0) {
        setStandaloneModalCard(null);
        setSelectedIndex(gi);
      } else {
        setStandaloneModalCard(next);
        setSelectedIndex(null);
      }
      return;
    }

    if (standalone === null && idx !== null && idx < nc.length - 1) {
      setSelectedIndex(idx + 1);
    }
  }, [normalizedCards, nationalDexStrip, nationalDexStripLoading]);

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
      const exitW = typeof window !== "undefined" ? window.innerWidth * 1.15 : 520;
      if (x < -horizontalThreshold && hasNext) {
        pendingNavRef.current = "next";
        setSlideTransition(true);
        setDragOffsetX(-exitW);
      } else if (x > horizontalThreshold && hasPrevious) {
        pendingNavRef.current = "prev";
        setSlideTransition(true);
        setDragOffsetX(exitW);
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
  const slideOpacity: number = slideTransition
    ? 1
    : Math.abs(dragOffsetX) > 2
      ? Math.max(0.52, 1 - Math.abs(dragOffsetX) / (viewportWidth * 0.72))
      : 1;

  const cardSwipeStyle: CSSProperties = {
    transform: `translate3d(${dragOffsetX}px, 0, 0)`,
    transition: slideTransition
      ? "transform 0.26s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.22s ease"
      : "none",
    opacity: slideOpacity,
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

        <div className="grid w-full gap-10 md:grid-cols-[minmax(260px,1fr)_minmax(280px,400px)] md:items-start md:gap-12">
          <div
            ref={leftColumnRef}
            className="flex w-full min-w-0 flex-col items-center gap-4 md:gap-5"
          >
            <div
              className="card-viewer-swipe-group flex w-full flex-col items-center gap-4 md:gap-5"
              style={cardSwipeStyle}
              onTransitionEnd={handleCardSlideTransitionEnd}
            >
              <div className="relative flex min-h-[50vh] w-full shrink-0 items-center justify-center sm:min-h-[50vh] md:min-h-[min(82vh,820px)] md:max-h-[88vh]">
                <img
                  src={selectedCard.highSrc || selectedCard.lowSrc || ""}
                  alt={`${selectedCard.set} ${selectedCard.filename}`}
                  className="block max-h-[min(64vh,640px)] w-auto max-w-[calc(100vw-1rem)] rounded-[var(--card-viewer-image-radius)] object-contain shadow-2xl md:max-h-[min(86vh,900px)] md:max-w-full"
                />
              </div>

              {(() => {
                const modalSetLogoSrc =
                  selectedCard.setLogoSrc || setLogosByCode?.[selectedCard.set] || "";
                const modalSetLabel = selectedCard.setName || selectedCard.set;
                const modalCardNumber =
                  selectedCard.cardNumber || selectedCard.filename.replace(/\.[^.]+$/, "");
                return (
                  <div className="w-full max-w-lg px-1 pb-1 text-center text-white md:max-w-none">
                    <h3 className="text-balance text-xl font-bold leading-tight md:text-2xl">
                      {selectedCard.cardName || "Unknown card"}
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
                    <p className="mt-2 text-xs text-white/50">
                      {modalCardNumber}
                      {selectedCard.rarity ? ` · ${selectedCard.rarity}` : ""}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-8 rounded-xl border border-white/15 bg-black/35 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-5 md:sticky md:top-6 md:self-start md:p-5">
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

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3 md:grid-cols-8 lg:grid-cols-8">
        {normalizedCards.map((card, index) => (
          <li
            key={`${card.set}/${card.filename}/${index}`}
            className="card-grid-item group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 shadow-sm transition hover:border-[var(--foreground)]/20 hover:shadow-md"
          >
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
        ))}
      </ul>
      {modal && createPortal(modal, document.body)}
    </>
  );
}
