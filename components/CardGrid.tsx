"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type CardEntry = {
  set: string;
  filename: string;
  src: string;
};

function getHighResSrc(card: CardEntry): string {
  return card.src.replace("/low/", "/high/");
}

export function CardGrid({ cards }: { cards: CardEntry[] }) {
  const [selectedCard, setSelectedCard] = useState<CardEntry | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const openModal = useCallback((card: CardEntry) => setSelectedCard(card), []);
  const closeModal = useCallback(() => setSelectedCard(null), []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeModal]);

  const modal = selectedCard && mounted && typeof document !== "undefined" && (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label="Card preview"
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] shrink-0 overflow-hidden rounded-lg border border-white/20 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={getHighResSrc(selectedCard)}
          alt={`${selectedCard.set} ${selectedCard.filename}`}
          className="max-h-[90vh] max-w-[90vw] object-contain"
        />
        <button
          type="button"
          onClick={closeModal}
          className="absolute right-2 top-2 rounded-full bg-black/80 p-1.5 text-white transition hover:bg-black"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <ul className="grid grid-cols-5 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {cards.map((card, index) => (
          <li
            key={`${card.set}/${card.filename}`}
            className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 shadow-sm transition hover:border-[var(--foreground)]/20 hover:shadow-md"
          >
            <div className="pointer-events-none absolute inset-0">
              <Image
                src={card.src}
                alt={`${card.set} ${card.filename}`}
                fill
                className="object-cover object-center"
                sizes="(max-width: 640px) 20vw, (max-width: 768px) 16.66vw, (max-width: 1024px) 12.5vw, 10vw"
                loading={index < 12 ? "eager" : undefined}
                priority={index < 6}
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
      {mounted && modal && createPortal(modal, document.body)}
    </>
  );
}
