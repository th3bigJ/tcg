"use client";

import { useEffect, useMemo, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import {
  PERSISTED_FILTERS_UPDATED_EVENT,
  readPersistedFilters,
  sortCards,
  DEFAULT_SORT,
  type SortOrder,
} from "@/lib/persistedFilters";
import type { SearchCardDataPayload } from "@/lib/searchCardDataServer";

type Props = {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  setSymbolsByCode?: Record<string, string>;
  customerLoggedIn: boolean;
  formAction: string;
  extraHiddenFields?: Record<string, string>;
  activeSearch: string;
  activeSet: string;
  activePokemon: string;
  activeRarity: string;
  activeEnergy: string;
  activeCategory: string;
  excludeCommonUncommon: boolean;
  excludeOwned?: boolean;
  rarityOptions: string[];
  energyOptions: string[];
  categoryOptions: string[];
  resetHref: string;
  initialSearchCardData?: SearchCardDataPayload | null;
};

export function SearchCardsTabGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
  initialSearchCardData,
}: Props) {
  // Defaults must match SSR (no localStorage); hydrate persisted prefs after mount to avoid mismatch.
  const [sort, setSort] = useState<SortOrder>(DEFAULT_SORT);
  const [groupBySet, setGroupBySet] = useState(false);
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [cardPrices, setCardPrices] = useState<Record<string, number> | null>(null);
  const cardData = customerLoggedIn ? initialSearchCardData ?? null : null;

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
      .then((data: { prices: Record<string, number> } | null) => {
        if (data?.prices) setCardPrices(data.prices);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [sort, cards, cardPrices]);

  useEffect(() => {
    const applyPersisted = () => {
      const persisted = readPersistedFilters("search");
      setSort(persisted.sort ?? DEFAULT_SORT);
      setGroupBySet(persisted.groupBySet ?? false);
      setShowOwnedOnly(persisted.showOwnedOnly ?? false);
    };
    applyPersisted();
    window.addEventListener("storage", applyPersisted);
    window.addEventListener(PERSISTED_FILTERS_UPDATED_EVENT, applyPersisted);
    return () => {
      window.removeEventListener("storage", applyPersisted);
      window.removeEventListener(PERSISTED_FILTERS_UPDATED_EVENT, applyPersisted);
    };
  }, []);

  const sortedCards = useMemo(() => {
    const visibleCards =
      showOwnedOnly && cardData?.collectionLines
        ? cards.filter((card) => {
            const masterCardId = card.masterCardId ?? "";
            return (cardData.collectionLines[masterCardId]?.length ?? 0) > 0;
          })
        : cards;

    return sortCards(visibleCards, sort, (c) => cardPrices?.[c.masterCardId ?? ""] ?? 0);
  }, [cards, sort, cardPrices, showOwnedOnly, cardData]);

  return (
    <CardGrid
      cards={sortedCards}
      setLogosByCode={setLogosByCode}
      setSymbolsByCode={setSymbolsByCode}
      customerLoggedIn={customerLoggedIn}
      itemConditions={cardData?.itemConditions}
      wishlistEntryIdsByMasterCardId={cardData?.wishlistMap}
      collectionLinesByMasterCardId={cardData?.collectionLines}
      groupBySet={groupBySet}
    />
  );
}
