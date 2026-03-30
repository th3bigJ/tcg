"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import {
  FilterChipButton,
  FilterClearChip,
  FilterChipRow,
  FilterChipSelect,
  FilterControlsShell,
  FilterSearchInput,
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
  formAction: string;
  activeSearch: string;
  activeRarity: string;
  activeEnergy: string;
  activeCategory: string;
  excludeCommonUncommon: boolean;
  rarityOptions: string[];
  energyOptions: string[];
  categoryOptions: string[];
};

export function ExpansionSetCardGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
  formAction,
  activeSearch,
  activeRarity,
  activeEnergy,
  activeCategory,
  excludeCommonUncommon,
  rarityOptions,
  energyOptions,
  categoryOptions,
}: Props) {
  const router = useRouter();
  const [cardData, setCardData] = useState<SearchCardData | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>("");
  const [cardPrices, setCardPrices] = useState<Record<string, number> | null>(null);
  const [rarePlusOnly, setRarePlusOnly] = useState(excludeCommonUncommon);
  const [notOwnedOnly, setNotOwnedOnly] = useState(false);
  const hasActiveFilters = Boolean(
    sortOrder || activeRarity || activeEnergy || activeCategory || rarePlusOnly || notOwnedOnly,
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

  useEffect(() => {
    setRarePlusOnly(excludeCommonUncommon);
  }, [excludeCommonUncommon]);

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
      return [...visibleCards].sort((a, b) =>
        (b.setReleaseDate ?? "").localeCompare(a.setReleaseDate ?? ""),
      );
    }
    if (effectiveSortOrder === "price-desc" && cardPrices) {
      return [...visibleCards].sort(
        (a, b) => (cardPrices[b.masterCardId ?? ""] ?? 0) - (cardPrices[a.masterCardId ?? ""] ?? 0),
      );
    }
    return visibleCards;
  }, [visibleCards, effectiveSortOrder, cardPrices]);

  const pushFilterState = (next: {
    rarity?: string;
    energy?: string;
    category?: string;
    excludeCu?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (activeSearch) params.set("search", activeSearch);
    if (next.rarity ?? activeRarity) params.set("rarity", next.rarity ?? activeRarity);
    const nextEnergy = next.energy !== undefined ? next.energy : activeEnergy;
    if (nextEnergy) params.set("energy", nextEnergy);
    if (next.excludeCu ?? excludeCommonUncommon) params.set("exclude_cu", "1");
    if (next.category ?? activeCategory) params.set("category", next.category ?? activeCategory);
    router.push(`${formAction}${params.size > 0 ? `?${params.toString()}` : ""}`);
  };

  const clearFilters = () => {
    setSortOrder("");
    setRarePlusOnly(false);
    setNotOwnedOnly(false);
    const params = new URLSearchParams();
    if (activeSearch) params.set("search", activeSearch);
    router.push(`${formAction}${params.size > 0 ? `?${params.toString()}` : ""}`);
  };

  return (
    <>
      <FilterControlsShell>
        <form method="get" action={formAction} className="flex items-center gap-2">
          <FilterSearchInput defaultValue={activeSearch} />
        </form>
        <FilterChipRow>
          {hasActiveFilters ? <FilterClearChip onClick={clearFilters} /> : null}
          <FilterChipSelect
            value={sortOrder}
            onChange={(value) => setSortOrder(value as SortOrder)}
            options={SORT_OPTIONS}
            ariaLabel="Sort order"
            defaultValue=""
          />
          <FilterChipSelect
            value={activeRarity}
            onChange={(value) => pushFilterState({ rarity: value })}
            options={[{ value: "", label: "Rarity" }, ...rarityOptions.map((v) => ({ value: v, label: v }))]}
            ariaLabel="Filter by rarity"
          />
          <FilterChipSelect
            value={activeEnergy}
            onChange={(value) => pushFilterState({ energy: value })}
            options={[{ value: "", label: "Energy" }, ...energyOptions.map((v) => ({ value: v, label: v }))]}
            ariaLabel="Filter by energy type"
            widthClass="w-auto"
          />
          <FilterChipSelect
            value={activeCategory}
            onChange={(value) => pushFilterState({ category: value })}
            options={[{ value: "", label: "Card type" }, ...categoryOptions.map((v) => ({ value: v, label: v }))]}
            ariaLabel="Filter by card type"
            widthClass="w-36"
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
        groupBySet={false}
      />
    </>
  );
}
