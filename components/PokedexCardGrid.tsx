"use client";

import { useEffect, useMemo, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { readPersistedFilters, sortCards, DEFAULT_SORT } from "@/lib/persistedFilters";
import type { CollectionLineSummary } from "@/lib/storefrontCardMaps";

type SearchCardData = {
  itemConditions: { id: string; name: string }[];
  wishlistMap: Record<string, { id: string; printing?: string }>;
  collectionLines: Record<string, CollectionLineSummary[]>;
};

type Props = {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  setSymbolsByCode?: Record<string, string>;
  customerLoggedIn: boolean;
  formAction: string;
  activeEnergy: string;
  energyOptions: string[];
};

export function PokedexCardGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
}: Props) {
  const [cardData, setCardData] = useState<SearchCardData | null>(null);
  const [sort, setSort] = useState(() => readPersistedFilters().sort ?? DEFAULT_SORT);
  const [cardPrices, setCardPrices] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!customerLoggedIn) return;
    const controller = new AbortController();
    fetch("/api/search-card-data", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SearchCardData | null) => { if (data) setCardData(data); })
      .catch(() => {});
    return () => controller.abort();
  }, [customerLoggedIn]);

  // Fetch prices if needed for sort
  useEffect(() => {
    if ((sort !== "price-desc" && sort !== "price-asc") || cardPrices) return;
    const masterCardIds = cards.map((c) => c.masterCardId).filter((id): id is string => Boolean(id));
    if (!masterCardIds.length) return;
    const controller = new AbortController();
    fetch("/api/card-pricing/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterCardIds }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prices: Record<string, number> } | null) => { if (data?.prices) setCardPrices(data.prices); })
      .catch(() => {});
    return () => controller.abort();
  }, [sort, cards, cardPrices]);

  // Re-sync sort if persisted filters change (e.g. user applies from another tab)
  useEffect(() => {
    const handler = () => setSort(readPersistedFilters().sort ?? DEFAULT_SORT);
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const sortedCards = useMemo(() => {
    return sortCards(cards, sort, (c) => cardPrices?.[c.masterCardId ?? ""] ?? 0);
  }, [cards, sort, cardPrices]);

  return (
    <CardGrid
      cards={sortedCards}
      setLogosByCode={setLogosByCode}
      setSymbolsByCode={setSymbolsByCode}
      customerLoggedIn={customerLoggedIn}
      itemConditions={cardData?.itemConditions}
      wishlistEntryIdsByMasterCardId={cardData?.wishlistMap}
      collectionLinesByMasterCardId={cardData?.collectionLines}
    />
  );
}
