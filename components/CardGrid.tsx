"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type CardEntry = {
  set: string;
  filename: string;
  lowSrc?: string;
  highSrc?: string;
  src?: string;
};

export function CardGrid({ cards }: { cards: CardEntry[] }) {
  const normalizedCards = cards
    .map((card) => {
      const lowSrc = card.lowSrc || card.src || "";
      const highSrc = card.highSrc || lowSrc;
      return { ...card, lowSrc, highSrc };
    })
    .filter((card) => card.lowSrc);

  type NormalizedCard = CardEntry & { lowSrc: string; highSrc: string };
  const [selectedCard, setSelectedCard] = useState<NormalizedCard | null>(null);

  const openModal = useCallback((card: NormalizedCard) => setSelectedCard(card), []);
  const closeModal = useCallback(() => setSelectedCard(null), []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeModal]);

  const modal = selectedCard && typeof document !== "undefined" && (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.72)" }}
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label="Card preview"
    >
      <div
        className="max-h-[96vh] max-w-[96vw] overflow-visible bg-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-fit w-fit">
          <img
            src={selectedCard.highSrc}
            alt={`${selectedCard.set} ${selectedCard.filename}`}
            className="block max-h-[96vh] max-w-[96vw] object-contain"
          />
          <button
            type="button"
            onClick={closeModal}
            className="absolute z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-black/90 text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition hover:scale-105 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            style={{ top: "-16px", right: "-16px" }}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ul className="grid grid-cols-5 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {normalizedCards.map((card, index) => (
          <li
            key={`${card.set}/${card.filename}`}
            className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 shadow-sm transition hover:border-[var(--foreground)]/20 hover:shadow-md"
          >
            <div className="pointer-events-none absolute inset-0">
              <img
                src={card.lowSrc}
                alt={`${card.set} ${card.filename}`}
                className="h-full w-full object-cover object-center"
                loading={index < 24 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={index < 8 ? "high" : "auto"}
              />
              <span className="absolute bottom-0 left-0 right-0 bg-[var(--foreground)]/80 px-1 py-0.5 text-center text-xs text-[var(--background)] opacity-0 transition group-hover:opacity-100">
                {card.set} / {card.filename.replace(/\.[^.]+$/, "")}
              </span>
            </div>
            <button
              type="button"
              className="absolute inset-0 z-10 cursor-pointer border-0 bg-transparent p-0"
              onClick={() => openModal(card)}
              aria-label={`View ${card.set} ${card.filename}`}
            />
          </li>
        ))}
      </ul>
      {modal && createPortal(modal, document.body)}
    </>
  );
}
