"use client";

import { useEffect, useMemo, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { PERSISTED_FILTERS_UPDATED_EVENT, readPersistedFilters, sortCards, DEFAULT_SORT } from "@/lib/persistedFilters";
import type { SearchCardDataPayload } from "@/lib/searchCardDataServer";
import type { CardPriceTrendSummary } from "@/lib/staticDataTypes";

type Props = {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  setSymbolsByCode?: Record<string, string>;
  customerLoggedIn: boolean;
  formAction: string;
  activeSearch: string;
  activeRarity: string;
  activeEnergy: string;
  activeCategory: string;
  excludeCommonUncommon: boolean;
  rarityOptions: string[];
  energyOptions: string[];
  categoryOptions: string[];
  initialSearchCardData?: SearchCardDataPayload | null;
};

export function ExpansionSetCardGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
  initialSearchCardData,
}: Props) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [cardPrices, setCardPrices] = useState<Record<string, number> | null>(null);
  const [cardTrends, setCardTrends] = useState<Record<string, CardPriceTrendSummary> | null>(null);
  const cardData = customerLoggedIn ? initialSearchCardData ?? null : null;

  useEffect(() => {
    if (
      (sort !== "price-desc" &&
        sort !== "price-asc" &&
        sort !== "change-desc" &&
        sort !== "change-asc") ||
      (cardPrices && cardTrends)
    ) {
      return;
    }
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
      .then((data: { prices: Record<string, number>; trends?: Record<string, CardPriceTrendSummary> } | null) => {
        if (data?.prices) setCardPrices(data.prices);
        if (data?.trends) setCardTrends(data.trends);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [sort, cards, cardPrices]);

  useEffect(() => {
    const handler = () => setSort(readPersistedFilters("expansions").sort ?? DEFAULT_SORT);
    window.addEventListener("storage", handler);
    window.addEventListener(PERSISTED_FILTERS_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(PERSISTED_FILTERS_UPDATED_EVENT, handler);
    };
  }, []);

  const sortedCards = useMemo(() => {
    return sortCards(
      cards,
      sort,
      (c) => cardPrices?.[c.masterCardId ?? ""] ?? 0,
      (c) => cardTrends?.[c.masterCardId ?? ""]?.weekly.changePct ?? Number.NEGATIVE_INFINITY,
    );
  }, [cards, sort, cardPrices, cardTrends]);

  return (
    <CardGrid
      cards={sortedCards}
      setLogosByCode={setLogosByCode}
      setSymbolsByCode={setSymbolsByCode}
      customerLoggedIn={customerLoggedIn}
      itemConditions={cardData?.itemConditions}
      wishlistEntryIdsByMasterCardId={cardData?.wishlistMap}
      collectionLinesByMasterCardId={cardData?.collectionLines}
      cardPricesByMasterCardId={cardPrices ?? {}}
      cardPriceTrendsByMasterCardId={cardTrends ?? {}}
      groupBySet={false}
    />
  );
}
