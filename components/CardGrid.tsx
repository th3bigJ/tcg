"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { createPortal } from "react-dom";

export type CardEntry = {
  set: string;
  setName?: string;
  setLogoSrc?: string;
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
};

function mulberry32(seed: number): () => number {
  let t = seed + 0x6d2b79f5;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandomCards(cards: CardEntry[], count: number, seed: number): CardEntry[] {
  if (cards.length <= count) return cards;
  const random = mulberry32(seed);
  const pool = [...cards];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }
  return pool.slice(0, count);
}

export function CardGrid({
  cards,
  setLogosByCode,
  similarMode = "set",
}: {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  similarMode?: "set" | "pokemon";
}) {
  const normalizedCards = cards
    .map((card) => {
      const lowSrc = card.lowSrc || card.src || "";
      const highSrc = card.highSrc || lowSrc;
      return { ...card, lowSrc, highSrc };
    })
    .filter((card) => card.lowSrc);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [relatedSeed, setRelatedSeed] = useState(1);
  const selectedCard = selectedIndex === null ? null : (normalizedCards[selectedIndex] ?? null);
  const hasPrevious = selectedIndex !== null && selectedIndex > 0;
  const hasNext = selectedIndex !== null && selectedIndex < normalizedCards.length - 1;

  const openModal = (index: number) => setSelectedIndex(index);
  const closeModal = () => setSelectedIndex(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const viewPrevious = () => {
    setSelectedIndex((current) => {
      if (current === null || current <= 0) return current;
      return current - 1;
    });
  };
  const viewNext = () => {
    setSelectedIndex((current) => {
      if (current === null || current >= normalizedCards.length - 1) return current;
      return current + 1;
    });
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchDeltaRef.current = { x: 0, y: 0 };
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    touchDeltaRef.current = {
      x: touch.clientX - start.x,
      y: touch.clientY - start.y,
    };
  };

  const handleTouchEnd = () => {
    const start = touchStartRef.current;
    if (!start) return;

    const { x, y } = touchDeltaRef.current;
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const horizontalThreshold = 50;
    const verticalThreshold = 70;

    if (absY > absX && y > verticalThreshold) {
      closeModal();
    } else if (absX > absY && absX > horizontalThreshold) {
      if (x < 0) {
        viewNext();
      } else {
        viewPrevious();
      }
    }

    touchStartRef.current = null;
    touchDeltaRef.current = { x: 0, y: 0 };
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIndex(null);
      }
      if (e.key === "ArrowLeft") {
        setSelectedIndex((current) => {
          if (current === null || current <= 0) return current;
          return current - 1;
        });
      }
      if (e.key === "ArrowRight") {
        setSelectedIndex((current) => {
          if (current === null || current >= normalizedCards.length - 1) return current;
          return current + 1;
        });
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [normalizedCards.length]);

  useEffect(() => {
    if (selectedIndex !== null) {
      setRelatedSeed((current) => current + 1);
    }
  }, [selectedIndex]);

  const relatedCards = useMemo(() => {
    if (selectedCard === null || selectedIndex === null) return [];

    const selectedDexIds = selectedCard.dexIds ?? [];
    return normalizedCards.filter((card, index) => {
      if (index === selectedIndex) return false;

      if (similarMode === "pokemon") {
        const cardDexIds = card.dexIds ?? [];
        if (selectedDexIds.length === 0) return false;
        return cardDexIds.some((dexId) => selectedDexIds.includes(dexId));
      }

      return card.set === selectedCard.set;
    });
  }, [normalizedCards, selectedCard, selectedIndex, similarMode]);

  const visibleRelatedCards = useMemo(
    () => pickRandomCards(relatedCards, 3, relatedSeed),
    [relatedCards, relatedSeed],
  );

  const modal = selectedCard && typeof document !== "undefined" && (
    <div
      className="card-viewer-overlay fixed inset-0 z-[9999] p-4 sm:p-6"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label="Card preview"
    >
      <div
        className="relative flex h-full w-full items-center"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          onClick={closeModal}
          className="card-viewer-icon-button absolute right-3 top-3 z-30 hidden h-12 w-12 items-center justify-center border border-white/60 bg-black/75 text-white transition hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:inline-flex"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        <button
          type="button"
          onClick={viewPrevious}
          disabled={!hasPrevious}
          className="card-viewer-icon-button absolute left-3 top-1/2 z-20 hidden h-16 w-16 -translate-y-1/2 items-center justify-center border border-white/55 bg-black/45 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex"
          aria-label="Previous card"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={viewNext}
          disabled={!hasNext}
          className="card-viewer-icon-button absolute right-3 top-1/2 z-20 hidden h-16 w-16 -translate-y-1/2 items-center justify-center border border-white/55 bg-black/45 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex"
          aria-label="Next card"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <div className="mx-auto flex h-full w-full max-w-[1460px] flex-col gap-3 px-2 py-2 md:grid md:grid-cols-[minmax(320px,1fr)_680px] md:items-center md:gap-8 md:px-20 md:py-3">
          <div className="md:hidden">
            <button
              type="button"
              onClick={closeModal}
              className="mb-1.5 block w-full bg-transparent text-center text-[11px] text-white/65"
              aria-label="Close card preview"
            >
              Swipe down to close.
            </button>
            <div className="flex items-start justify-between gap-3 rounded-lg border border-white/20 bg-black/40 p-3 text-white">
              <div className="min-w-0">
                <h3 className="truncate text-xl font-semibold">
                  {selectedCard.cardName || "Unknown card"}
                </h3>
                <p className="mt-1 text-sm text-white/80">
                  {selectedCard.setName || selectedCard.set} /{" "}
                  {selectedCard.cardNumber || selectedCard.filename.replace(/\.[^.]+$/, "")}
                </p>
              </div>
              {(selectedCard.setLogoSrc || setLogosByCode?.[selectedCard.set]) ? (
                <div className="w-24 shrink-0 rounded-md border border-white/20 bg-black/30 p-1.5">
                  <img
                    src={selectedCard.setLogoSrc || setLogosByCode?.[selectedCard.set]}
                    alt={`${selectedCard.setName || selectedCard.set} logo`}
                    className="h-9 w-full object-contain"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="relative flex h-[52vh] shrink-0 items-center justify-center md:h-[86vh] md:justify-end">
            <button
              type="button"
              onClick={viewPrevious}
              disabled={!hasPrevious}
              className="card-viewer-icon-button absolute left-1 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-white/55 bg-black/45 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40 md:hidden"
              aria-label="Previous card"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>

            <img
              src={selectedCard.highSrc}
              alt={`${selectedCard.set} ${selectedCard.filename}`}
              className="block max-h-full w-auto max-w-[calc(100vw-7rem)] rounded-lg object-contain shadow-2xl md:max-w-full"
            />

            <button
              type="button"
              onClick={viewNext}
              disabled={!hasNext}
              className="card-viewer-icon-button absolute right-1 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-white/55 bg-black/45 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40 md:hidden"
              aria-label="Next card"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 w-full flex-1 rounded-lg border border-white/20 bg-black/40 p-3 text-white backdrop-blur-[1px] md:h-[86vh] md:max-w-[680px] md:flex-none md:overflow-y-auto md:p-5 md:justify-self-start">
            <div className="hidden items-start justify-between gap-3 md:flex">
              <div className="min-w-0">
                <h3 className="text-2xl font-semibold">{selectedCard.cardName || "Unknown card"}</h3>
                <p className="mt-1 text-sm text-white/80">
                  {selectedCard.setName || selectedCard.set} /{" "}
                  {selectedCard.cardNumber || selectedCard.filename.replace(/\.[^.]+$/, "")}
                </p>
              </div>
              {(selectedCard.setLogoSrc || setLogosByCode?.[selectedCard.set]) ? (
                <div className="w-28 shrink-0 rounded-md border border-white/20 bg-black/30 p-1.5">
                  <img
                    src={selectedCard.setLogoSrc || setLogosByCode?.[selectedCard.set]}
                    alt={`${selectedCard.setName || selectedCard.set} logo`}
                    className="h-10 w-full object-contain"
                  />
                </div>
              ) : null}
            </div>

            <div className="md:hidden flex flex-col gap-2">
              <section className="rounded-md border border-white/15 bg-black/30 p-2.5">
                <h4 className="text-xs font-semibold text-white">Card details</h4>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="min-w-0">
                    <dt className="text-white/65">Set</dt>
                    <dd className="mt-0.5 truncate text-sm">{selectedCard.setName || selectedCard.set}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-white/65">Card</dt>
                    <dd className="mt-0.5 truncate text-sm">
                      {selectedCard.cardNumber || selectedCard.filename.replace(/\.[^.]+$/, "")}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-white/65">Rarity</dt>
                    <dd className="mt-0.5 truncate text-sm">{selectedCard.rarity || "Unknown"}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-md border border-white/15 bg-black/30 p-2.5">
                <h4 className="text-xs font-semibold text-white">Pokemon details</h4>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="min-w-0">
                    <dt className="text-white/65">Category</dt>
                    <dd className="mt-0.5 truncate text-sm">{selectedCard.category || "Unknown"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-white/65">Stage</dt>
                    <dd className="mt-0.5 truncate text-sm">{selectedCard.stage || "Unknown"}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-white/65">HP</dt>
                    <dd className="mt-0.5 truncate text-sm">
                      {typeof selectedCard.hp === "number" ? selectedCard.hp : "Unknown"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-white/65">Type(s)</dt>
                    <dd className="mt-0.5 truncate text-sm">
                      {selectedCard.elementTypes && selectedCard.elementTypes.length > 0
                        ? selectedCard.elementTypes.join(", ")
                        : "Unknown"}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="mt-5 hidden min-h-0 flex-1 flex-col gap-4 md:flex">
              <section className="rounded-md border border-white/15 bg-black/30 p-3">
                <h4 className="text-sm font-semibold text-white">Card details</h4>
                <dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-white/65">Set</dt>
                    <dd className="mt-1 text-base">{selectedCard.setName || selectedCard.set}</dd>
                  </div>
                  <div>
                    <dt className="text-white/65">Card number</dt>
                    <dd className="mt-1 text-base">
                      {selectedCard.cardNumber ||
                        selectedCard.filename.replace(/\.[^.]+$/, "")}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-white/65">Rarity</dt>
                    <dd className="mt-1 text-base">{selectedCard.rarity || "Unknown"}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-md border border-white/15 bg-black/30 p-3">
                <h4 className="text-sm font-semibold text-white">Pokemon details</h4>
                <dl className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-white/65">Category</dt>
                    <dd className="mt-1 text-base">{selectedCard.category || "Unknown"}</dd>
                  </div>
                  <div>
                    <dt className="text-white/65">Stage</dt>
                    <dd className="mt-1 text-base">{selectedCard.stage || "Unknown"}</dd>
                  </div>
                  <div>
                    <dt className="text-white/65">HP</dt>
                    <dd className="mt-1 text-base">
                      {typeof selectedCard.hp === "number" ? selectedCard.hp : "Unknown"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-white/65">Element Type(s)</dt>
                    <dd className="mt-1 text-base">
                      {selectedCard.elementTypes && selectedCard.elementTypes.length > 0
                        ? selectedCard.elementTypes.join(", ")
                        : "Unknown"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-white/65">Pokemon Dex ID(s)</dt>
                    <dd className="mt-1 text-base">
                      {selectedCard.dexIds && selectedCard.dexIds.length > 0
                        ? selectedCard.dexIds.join(", ")
                        : "Not available"}
                    </dd>
                  </div>
                </dl>
              </section>

              {(() => {
                if (relatedCards.length === 0) return null;
                const canRandomize = relatedCards.length > 3;

                return (
                  <section className="mt-auto rounded-md border border-white/15 bg-black/30 p-3">
                    <h4 className="text-sm font-semibold text-white">Similar Cards</h4>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRelatedSeed((current) => current + 1)}
                        disabled={!canRandomize}
                        className="card-viewer-icon-button inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/45 bg-black/40 text-white transition hover:bg-black/65 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Show another similar cards set"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                      </button>
                      <ul className="grid min-w-0 flex-1 grid-cols-3 gap-2">
                        {visibleRelatedCards.map((card) => {
                          const cardIndex = normalizedCards.findIndex(
                            (gridCard) =>
                              gridCard.set === card.set && gridCard.filename === card.filename,
                          );
                          return (
                            <li key={`${card.set}/${card.filename}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (cardIndex >= 0) setSelectedIndex(cardIndex);
                                }}
                                className="block w-full rounded-md border border-white/20 bg-black/20 p-2.5 transition hover:border-white/45 hover:bg-black/45"
                                aria-label={`View ${card.cardName || card.filename}`}
                              >
                                <img
                                  src={card.lowSrc}
                                  alt={card.cardName || card.filename}
                                  className="mx-auto h-44 w-full object-contain"
                                  loading="lazy"
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <button
                        type="button"
                        onClick={() => setRelatedSeed((current) => current + 1)}
                        disabled={!canRandomize}
                        className="card-viewer-icon-button inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/45 bg-black/40 text-white transition hover:bg-black/65 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Show another similar cards set"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    </div>
                  </section>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-8">
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
