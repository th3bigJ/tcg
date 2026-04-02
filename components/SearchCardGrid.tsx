"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { CardTagFilterRow } from "@/components/CardTagFilterRow";
import type { SearchCardDataPayload } from "@/lib/searchCardDataServer";

type SortOrder = "" | "price-desc" | "release-desc";

const appendOnlySortOrderCache = new Map<string, string[]>();

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "", label: "Sort" },
  { value: "price-desc", label: "Price" },
  { value: "release-desc", label: "Release date" },
];

type Props = {
  cards: CardEntry[];
  initialCardPrices?: Record<string, number>;
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
  defaultGroupBySet?: boolean;
  defaultRandomOrder?: boolean;
  showGroupBySetTag?: boolean;
  defaultSortOrder?: SortOrder;
  priceAppendOnlyKey?: string;
  initialSearchCardData?: SearchCardDataPayload | null;
};

export function SearchCardGrid({
  cards,
  initialCardPrices,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
  formAction,
  extraHiddenFields,
  activeSearch,
  activeSet,
  activePokemon,
  activeRarity,
  activeEnergy,
  activeCategory,
  excludeCommonUncommon,
  excludeOwned = false,
  rarityOptions,
  energyOptions,
  categoryOptions,
  resetHref,
  defaultGroupBySet = true,
  defaultRandomOrder,
  showGroupBySetTag = true,
  defaultSortOrder = "",
  priceAppendOnlyKey,
  initialSearchCardData,
}: Props) {
  const [groupBySet, setGroupBySet] = useState(defaultGroupBySet);
  const [randomOrder, setRandomOrder] = useState(defaultRandomOrder ?? false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSortOrder);
  const [cardPrices, setCardPrices] = useState<Record<string, number> | null>(null);
  const requestedPriceIdsRef = useRef<Set<string>>(new Set());
  const cardData = customerLoggedIn ? initialSearchCardData ?? null : null;
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

  const effectiveCardPrices = useMemo(
    () => ({ ...(initialCardPrices ?? {}), ...(cardPrices ?? {}) }),
    [initialCardPrices, cardPrices],
  );

  const sortCardsBatch = useMemo(
    () => (inputCards: CardEntry[], activeSortOrder: SortOrder) => {
      if (activeSortOrder === "release-desc") {
        return [...inputCards].sort((a, b) =>
          (b.setReleaseDate ?? "").localeCompare(a.setReleaseDate ?? ""),
        );
      }
      if (activeSortOrder === "price-desc" && Object.keys(effectiveCardPrices).length > 0) {
        return [...inputCards].sort(
          (a, b) =>
            (effectiveCardPrices[b.masterCardId ?? ""] ?? 0) -
            (effectiveCardPrices[a.masterCardId ?? ""] ?? 0),
        );
      }
      return inputCards;
    },
    [effectiveCardPrices],
  );

  const cardsMissingPrices = useMemo(() => {
    if (sortOrder !== "price-desc") return [];
    const knownPrices = effectiveCardPrices;
    const seen = new Set<string>();
    return cards
      .map((card) => card.masterCardId)
      .filter((id): id is string => Boolean(id))
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return knownPrices[id] === undefined;
      });
  }, [cards, sortOrder, effectiveCardPrices]);

  // Fetch prices for any cards in the current grid that don't have them yet.
  useEffect(() => {
    const idsToFetch = cardsMissingPrices.filter((id) => !requestedPriceIdsRef.current.has(id));
    if (idsToFetch.length === 0) return;
    for (const id of idsToFetch) requestedPriceIdsRef.current.add(id);
    const controller = new AbortController();
    fetch("/api/card-pricing/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterCardIds: idsToFetch }),
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
    if (sortOrder) {
      if (priceAppendOnlyKey) {
        const cardsById = new Map(
          cards.map((card) => [card.masterCardId ?? `${card.set}/${card.filename}`, card]),
        );
        const previousOrder =
          appendOnlySortOrderCache.get(`${priceAppendOnlyKey}:${sortOrder}`) ?? [];
        const seen = new Set<string>();

        const preserved = previousOrder
          .map((id) => {
            const card = cardsById.get(id);
            if (card) seen.add(id);
            return card;
          })
          .filter((card): card is CardEntry => Boolean(card));

        const appended = cards
          .filter((card) => {
            const id = card.masterCardId ?? `${card.set}/${card.filename}`;
            return !seen.has(id);
          })
          ;

        return [...preserved, ...sortCardsBatch(appended, sortOrder)];
      }

      return sortCardsBatch(cards, sortOrder);
    }
    return cards;
  }, [cards, sortOrder, sortCardsBatch, priceAppendOnlyKey]);
  const deferredSortedCards = useDeferredValue(sortedCards);

  useEffect(() => {
    if (!priceAppendOnlyKey) return;
    if (!sortOrder) {
      for (const key of appendOnlySortOrderCache.keys()) {
        if (key.startsWith(`${priceAppendOnlyKey}:`)) {
          appendOnlySortOrderCache.delete(key);
        }
      }
      return;
    }
    if (sortOrder === "price-desc" && Object.keys(effectiveCardPrices).length === 0) {
      appendOnlySortOrderCache.delete(`${priceAppendOnlyKey}:${sortOrder}`);
      return;
    }
    appendOnlySortOrderCache.set(
      `${priceAppendOnlyKey}:${sortOrder}`,
      sortedCards.map((card) => card.masterCardId ?? `${card.set}/${card.filename}`),
    );
  }, [priceAppendOnlyKey, sortOrder, sortedCards, effectiveCardPrices]);

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
            activeEnergy,
            activeCategory,
            excludeCommonUncommon,
            excludeOwned,
            rarityOptions: rarityOptions ?? [],
            energyOptions: energyOptions ?? [],
            categoryOptions: categoryOptions ?? [],
            resetHref,
          }}
        />
      </div>
      <CardGrid
        cards={deferredSortedCards}
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
