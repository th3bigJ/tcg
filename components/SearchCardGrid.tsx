"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { CardTagFilterRow } from "@/components/CardTagFilterRow";
import type { CollectionLineSummary } from "@/lib/storefrontCardMaps";

type SearchCardData = {
  itemConditions: { id: string; name: string }[];
  wishlistMap: Record<string, { id: string; printing?: string }>;
  collectionLines: Record<string, CollectionLineSummary[]>;
};

type SortOrder = "" | "price-desc" | "release-desc";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "", label: "Sort" },
  { value: "price-desc", label: "Price" },
  { value: "release-desc", label: "Release date" },
];

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
  activeCategory: string;
  excludeCommonUncommon: boolean;
  rarityOptions: string[];
  categoryOptions: string[];
  resetHref: string;
};

export function SearchCardGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
  formAction,
  extraHiddenFields,
  activeSearch,
  activeSet,
  activePokemon,
  activeRarity,
  activeCategory,
  excludeCommonUncommon,
  rarityOptions,
  categoryOptions,
  resetHref,
}: Props) {
  const [cardData, setCardData] = useState<SearchCardData | null>(null);
  const [groupBySet, setGroupBySet] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("");
  const [cardPrices, setCardPrices] = useState<Record<string, number> | null>(null);
  const pricesFetchedRef = useRef(false);

  useEffect(() => {
    if (!customerLoggedIn) return;
    const controller = new AbortController();
    fetch("/api/search-card-data", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SearchCardData | null) => {
        if (data) setCardData(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [customerLoggedIn]);

  // Fetch bulk prices the first time price sort is requested
  useEffect(() => {
    if (sortOrder !== "price-desc" || pricesFetchedRef.current) return;
    pricesFetchedRef.current = true;
    const masterCardIds = cards
      .map((c) => c.masterCardId)
      .filter((id): id is string => Boolean(id));
    if (masterCardIds.length === 0) return;
    fetch("/api/card-pricing/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterCardIds }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prices: Record<string, number> } | null) => {
        if (data?.prices) setCardPrices(data.prices);
      })
      .catch(() => {});
  }, [sortOrder, cards]);

  const sortedCards = useMemo(() => {
    if (sortOrder === "release-desc") {
      return [...cards].sort((a, b) =>
        (b.setReleaseDate ?? "").localeCompare(a.setReleaseDate ?? ""),
      );
    }
    return cards;
  }, [cards, sortOrder, cardData?.cardPrices]);

  return (
    <>
      <div className="mb-3">
        <CardTagFilterRow
          groupBySet={groupBySet}
          onGroupBySetChange={setGroupBySet}
          sortControl={{
            value: sortOrder,
            onChange: (v) => setSortOrder(v as SortOrder),
            options: SORT_OPTIONS,
          }}
          searchFilter={{
            formAction,
            extraHiddenFields,
            activeSearch,
            activeSet,
            activePokemon,
            activeRarity,
            activeCategory,
            excludeCommonUncommon,
            rarityOptions: rarityOptions ?? [],
            categoryOptions: categoryOptions ?? [],
            resetHref,
          }}
        />
      </div>
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
    </>
  );
}
