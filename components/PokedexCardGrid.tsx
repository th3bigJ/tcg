"use client";

import { useEffect, useMemo, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { PERSISTED_FILTERS_UPDATED_EVENT, readPersistedFilters, sortCards, DEFAULT_SORT } from "@/lib/persistedFilters";
import type { SearchCardDataPayload } from "@/lib/searchCardDataServer";

type Props = {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  setSymbolsByCode?: Record<string, string>;
  customerLoggedIn: boolean;
  routeGroupBySet?: boolean;
  formAction: string;
  activeEnergy: string;
  energyOptions: string[];
  initialSearchCardData?: SearchCardDataPayload | null;
};

export function PokedexCardGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
  routeGroupBySet,
  initialSearchCardData,
}: Props) {
  const [sort, setSort] = useState(() => readPersistedFilters("pokedex").sort ?? DEFAULT_SORT);
  const [groupBySet, setGroupBySet] = useState(() => readPersistedFilters("pokedex").groupBySet ?? false);
  const [cardPrices, setCardPrices] = useState<Record<string, number> | null>(null);
  const cardData = customerLoggedIn ? initialSearchCardData ?? null : null;

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
    const handler = () => {
      const persisted = readPersistedFilters("pokedex");
      setSort(persisted.sort ?? DEFAULT_SORT);
      setGroupBySet(persisted.groupBySet ?? false);
    };
    window.addEventListener("storage", handler);
    window.addEventListener(PERSISTED_FILTERS_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(PERSISTED_FILTERS_UPDATED_EVENT, handler);
    };
  }, []);

  const sortedCards = useMemo(() => {
    return sortCards(cards, sort, (c) => cardPrices?.[c.masterCardId ?? ""] ?? 0);
  }, [cards, sort, cardPrices]);

  const effectiveGroupBySet = routeGroupBySet ?? groupBySet;

  return (
    <CardGrid
      cards={sortedCards}
      setLogosByCode={setLogosByCode}
      setSymbolsByCode={setSymbolsByCode}
      customerLoggedIn={customerLoggedIn}
      itemConditions={cardData?.itemConditions}
      wishlistEntryIdsByMasterCardId={cardData?.wishlistMap}
      collectionLinesByMasterCardId={cardData?.collectionLines}
      groupBySet={effectiveGroupBySet}
    />
  );
}
