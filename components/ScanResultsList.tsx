"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import type { CardsPageCardEntry } from "@/lib/cardsPageQueries";

type Props = {
  candidates: CardsPageCardEntry[];
  confidence: "high" | "low";
  customerLoggedIn: boolean;
  ocrCardName: string;
};

export function ScanResultsList({ candidates, confidence, customerLoggedIn, ocrCardName }: Props) {
  const [cardPrices, setCardPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (candidates.length === 0) return;
    const ids = candidates.map((c) => c.masterCardId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;

    const controller = new AbortController();
    fetch("/api/card-pricing/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterCardIds: ids }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prices: Record<string, number> } | null) => {
        if (data?.prices) setCardPrices(data.prices);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [candidates]);

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-[var(--foreground)]/60">
        <p className="text-sm font-medium">No match found</p>
        {ocrCardName ? (
          <Link
            href={`/search?search=${encodeURIComponent(ocrCardName)}`}
            className="text-sm underline underline-offset-2"
          >
            Search manually for &ldquo;{ocrCardName}&rdquo;
          </Link>
        ) : (
          <Link href="/search" className="text-sm underline underline-offset-2">
            Search manually
          </Link>
        )}
      </div>
    );
  }

  const cards: CardEntry[] = candidates.map((c) => ({ ...c }));

  if (confidence === "high" && candidates.length === 1) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">
          Match found
        </p>
        <CardGrid
          cards={cards}
          customerLoggedIn={customerLoggedIn}
          cardPricesByMasterCardId={cardPrices}
          wishlistEntryIdsByMasterCardId={{}}
          collectionLinesByMasterCardId={{}}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">
        Did you mean one of these?
      </p>
      <CardGrid
        cards={cards}
        customerLoggedIn={customerLoggedIn}
        cardPricesByMasterCardId={cardPrices}
        wishlistEntryIdsByMasterCardId={{}}
        collectionLinesByMasterCardId={{}}
      />
    </div>
  );
}
