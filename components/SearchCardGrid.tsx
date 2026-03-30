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
  defaultGroupBySet?: boolean;
  defaultRandomOrder?: boolean;
  showGroupBySetTag?: boolean;
  defaultSortOrder?: SortOrder;
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
  defaultGroupBySet = true,
  defaultRandomOrder,
  showGroupBySetTag = true,
  defaultSortOrder = "",
}: Props) {
  const [cardData, setCardData] = useState<SearchCardData | null>(null);
  const [groupBySet, setGroupBySet] = useState(defaultGroupBySet);
  const [randomOrder, setRandomOrder] = useState(defaultRandomOrder ?? false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSortOrder);
  const [cardPrices, setCardPrices] = useState<Record<string, number> | null>(null);
  const groupShuffleSeed = useMemo(
    () =>
      cards.reduce((seed, card, index) => {
        const source = `${card.masterCardId ?? card.filename}:${index}`;
        let nextSeed = seed;
        for (let i = 0; i < source.length; i++) {
          nextSeed = Math.imul(nextSeed ^ source.charCodeAt(i), 16777619);
        }
        return nextSeed >>> 0;
      }, 2166136261),
    [cards],
  );

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

  const cardsMissingPrices = useMemo(() => {
    if (sortOrder !== "price-desc") return [];
    const knownPrices = cardPrices ?? {};
    const seen = new Set<string>();
    return cards
      .map((card) => card.masterCardId)
      .filter((id): id is string => Boolean(id))
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return knownPrices[id] === undefined;
      });
  }, [cards, sortOrder, cardPrices]);

  // Fetch prices for any cards in the current grid that don't have them yet.
  useEffect(() => {
    if (cardsMissingPrices.length === 0) return;
    const controller = new AbortController();
    fetch("/api/card-pricing/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterCardIds: cardsMissingPrices }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { prices: Record<string, number> } | null) => {
        if (!data?.prices) return;
        setCardPrices((current) => ({ ...(current ?? {}), ...data.prices }));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [cardsMissingPrices]);

  const sortedCards = useMemo(() => {
    if (sortOrder === "release-desc") {
      return [...cards].sort((a, b) =>
        (b.setReleaseDate ?? "").localeCompare(a.setReleaseDate ?? ""),
      );
    }
    if (sortOrder === "price-desc" && cardPrices) {
      return [...cards].sort(
        (a, b) => (cardPrices[b.masterCardId ?? ""] ?? 0) - (cardPrices[a.masterCardId ?? ""] ?? 0),
      );
    }
    return cards;
  }, [cards, sortOrder, cardPrices]);

  return (
    <>
      <div className="mb-3">
        <CardTagFilterRow
          groupBySet={groupBySet}
          onGroupBySetChange={setGroupBySet}
          showGroupBySetTag={showGroupBySetTag}
          randomOrder={defaultRandomOrder !== undefined ? randomOrder : undefined}
          onRandomOrderChange={defaultRandomOrder !== undefined ? setRandomOrder : undefined}
          sortControl={{
            value: sortOrder,
            onChange: (v) => setSortOrder(v as SortOrder),
            options: SORT_OPTIONS,
            defaultValue: defaultSortOrder,
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
        groupShuffleSeed={randomOrder ? groupShuffleSeed : undefined}
      />
    </>
  );
}
