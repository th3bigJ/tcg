"use client";

import { useEffect, useMemo, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import {
  FilterChipButton,
  FilterClearChip,
  FilterChipRow,
  FilterChipSelect,
  FilterControlsShell,
} from "@/components/card-filters/FilterPrimitives";
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
};

export function PokedexCardGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
}: Props) {
  const [cardData, setCardData] = useState<SearchCardData | null>(null);
  const [groupBySet, setGroupBySet] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("");
  const [cardPrices, setCardPrices] = useState<Record<string, number> | null>(null);
  const [rarePlusOnly, setRarePlusOnly] = useState(false);
  const [notOwnedOnly, setNotOwnedOnly] = useState(false);
  const hasActiveFilters = Boolean(groupBySet || sortOrder || rarePlusOnly || notOwnedOnly);

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

  useEffect(() => {
    if (sortOrder !== "price-desc" || cardPrices) return;
    const masterCardIds = cards.map((card) => card.masterCardId).filter((id): id is string => Boolean(id));
    if (masterCardIds.length === 0) return;
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
  }, [sortOrder, cards, cardPrices]);

  const visibleCards = useMemo(() => {
    return cards.filter((card) => {
      if (rarePlusOnly) {
        const rarity = (card.rarity ?? "").trim().toLowerCase();
        if (rarity === "common" || rarity === "uncommon") return false;
      }
      if (notOwnedOnly && card.masterCardId && (cardData?.collectionLines[card.masterCardId]?.length ?? 0) > 0) {
        return false;
      }
      return true;
    });
  }, [cards, rarePlusOnly, notOwnedOnly, cardData]);

  const effectiveSortOrder: SortOrder = sortOrder || "release-desc";

  const sortedCards = useMemo(() => {
    if (effectiveSortOrder === "release-desc") {
      return [...visibleCards].sort(
        (a, b) => (b.setReleaseDate ?? "").localeCompare(a.setReleaseDate ?? ""),
      );
    }
    if (effectiveSortOrder === "price-desc" && cardPrices) {
      return [...visibleCards].sort(
        (a, b) => (cardPrices[b.masterCardId ?? ""] ?? 0) - (cardPrices[a.masterCardId ?? ""] ?? 0),
      );
    }
    return visibleCards;
  }, [visibleCards, effectiveSortOrder, cardPrices]);

  const clearFilters = () => {
    setGroupBySet(false);
    setSortOrder("");
    setRarePlusOnly(false);
    setNotOwnedOnly(false);
  };

  return (
    <>
      <FilterControlsShell>
        <FilterChipRow>
          {hasActiveFilters ? <FilterClearChip onClick={clearFilters} /> : null}
          <FilterChipButton
            label="Group by set"
            active={groupBySet}
            onClick={() => setGroupBySet((value) => !value)}
          />
          <FilterChipSelect
            value={sortOrder}
            onChange={(value) => setSortOrder(value as SortOrder)}
            options={SORT_OPTIONS}
            ariaLabel="Sort order"
            defaultValue=""
          />
          <FilterChipButton
            label="Rare+ only"
            active={rarePlusOnly}
            onClick={() => setRarePlusOnly((value) => !value)}
          />
          <FilterChipButton
            label="Not owned"
            active={notOwnedOnly}
            onClick={() => setNotOwnedOnly((value) => !value)}
          />
        </FilterChipRow>
      </FilterControlsShell>
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
