"use client";

import { useMemo, useState, useEffect } from "react";
import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { cardMatchesEnergyTypeSelection } from "@/lib/cardEnergyFilter";
import { readPersistedFilters } from "@/lib/persistedFilters";
import type { CollectionLineSummary, StorefrontCardExtras } from "@/lib/storefrontCardMaps";

const COMMON_UNCOMMON = new Set(["Common", "Uncommon"]);

type SortOrder = "price-desc" | "price-asc" | "release-desc" | "release-asc" | "number-desc" | "number-asc" | "added-desc";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "price-desc", label: "Price: high to low" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "release-desc", label: "Release date: newest first" },
  { value: "release-asc", label: "Release date: oldest first" },
  { value: "number-desc", label: "Card number: high to low" },
  { value: "number-asc", label: "Card number: low to high" },
  { value: "added-desc", label: "Added date: newest first" },
];

function normalizeFilterOptionLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function preferredFilterOptionLabel(labels: string[]) {
  return [...labels].sort((a, b) => {
    const aHasUppercase = /[A-Z]/.test(a);
    const bHasUppercase = /[A-Z]/.test(b);
    if (aHasUppercase !== bHasUppercase) return aHasUppercase ? -1 : 1;
    return a.localeCompare(b);
  })[0] ?? "";
}

function buildDistinctFilterOptions(values: Array<string | null | undefined>) {
  const grouped = new Map<string, string[]>();

  for (const rawValue of values) {
    const label = normalizeFilterOptionLabel(String(rawValue ?? ""));
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.push(label);
    } else {
      grouped.set(key, [label]);
    }
  }

  return [...grouped.values()]
    .map((labels) => preferredFilterOptionLabel(labels))
    .sort((a, b) => a.localeCompare(b));
}

type CollectCardGridWithTagsProps = {
  cards: (CardEntry & Pick<StorefrontCardExtras, "addedAt">)[];
  setLogosByCode: Record<string, string>;
  setSymbolsByCode: Record<string, string>;
  variant: "collection" | "wishlist";
  itemConditions: { id: string; name: string }[];
  wishlistEntryIdsByMasterCardId: Record<string, { id: string; printing?: string }>;
  collectionLinesByMasterCardId: Record<string, CollectionLineSummary[]>;
  cardPricesByMasterCardId: Record<string, number>;
  manualPriceMasterCardIds?: Set<string>;
  gradingByMasterCardId?: Record<string, { company: string; grade: string; imageUrl?: string }>;
  readOnly?: boolean;
  collectionSectionTitle?: string;
  /** Master card IDs the viewer owns (shared wishlist: show badge + optional filter) */
  viewerOwnedMasterCardIds?: Set<string>;
  /** When true with viewerOwnedMasterCardIds, show “Cards I own” filter on wishlist */
  sharedWishlistOwnedFilter?: boolean;
  /** Trade wizard: tap tiles to select line quantities */
  tradePickMode?: boolean;
  tradeSelectedQtyByEntryId?: Record<string, number>;
  onTradePickEntry?: (entryId: string, card: CardEntry, maxQty: number) => void;
};

export function CollectCardGridWithTags({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  variant,
  itemConditions,
  wishlistEntryIdsByMasterCardId,
  collectionLinesByMasterCardId,
  cardPricesByMasterCardId,
  manualPriceMasterCardIds,
  gradingByMasterCardId,
  readOnly = false,
  collectionSectionTitle,
  viewerOwnedMasterCardIds,
  sharedWishlistOwnedFilter = false,
  tradePickMode = false,
  tradeSelectedQtyByEntryId,
  onTradePickEntry,
}: CollectCardGridWithTagsProps) {
  const [groupBySet, setGroupBySet] = useState(false);
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState(() => readPersistedFilters().rarity ?? "");
  const [energy, setEnergy] = useState(() => readPersistedFilters().energy ?? "");
  const [category, setCategory] = useState(() => readPersistedFilters().category ?? "");
  const [excludeCommonUncommon, setExcludeCommonUncommon] = useState(() => readPersistedFilters().excludeCommonUncommon ?? false);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    const s = readPersistedFilters().sort;
    if (s === "price-asc" || s === "price-desc" || s === "release-desc" || s === "release-asc") return s as SortOrder;
    return "price-desc";
  });
  const [ownedFilterOnly, setOwnedFilterOnly] = useState(false);

  // Count unique cards per set from the full unfiltered list
  const collectedCountBySetCode = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of cards) {
      if (!card.set) continue;
      counts[card.set] = (counts[card.set] ?? 0) + 1;
    }
    return counts;
  }, [cards]);

  const rarityOptions = useMemo(() => {
    return buildDistinctFilterOptions(cards.map((card) => card.rarity));
  }, [cards]);

  const energyOptions = useMemo(() => {
    return buildDistinctFilterOptions(cards.flatMap((card) => card.elementTypes ?? []));
  }, [cards]);

  const categoryOptions = useMemo(() => {
    return buildDistinctFilterOptions(cards.map((card) => card.category));
  }, [cards]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = cards.filter((card) => {
      if (
        sharedWishlistOwnedFilter &&
        variant === "wishlist" &&
        ownedFilterOnly &&
        viewerOwnedMasterCardIds &&
        card.masterCardId
      ) {
        if (!viewerOwnedMasterCardIds.has(card.masterCardId)) return false;
      }
      if (q) {
        const name = (card.cardName ?? "").toLowerCase();
        const number = (card.cardNumber ?? "").toLowerCase();
        const artist = (card.artist ?? "").toLowerCase();
        if (!name.includes(q) && !number.includes(q) && !artist.includes(q)) return false;
      }
      if (rarity && card.rarity !== rarity) return false;
      if (energy && !cardMatchesEnergyTypeSelection(card.elementTypes, energy)) return false;
      if (category && card.category !== category) return false;
      if (excludeCommonUncommon && COMMON_UNCOMMON.has(card.rarity)) return false;
      if (duplicatesOnly && (card.quantity ?? 1) <= 1) return false;
      return true;
    });

    const getPrice = (card: typeof result[0]) => {
      const k = card.collectionGroupKey ?? card.masterCardId ?? "";
      return (k ? cardPricesByMasterCardId[k] : undefined) ?? 0;
    };
    if (sortOrder === "price-desc") {
      result = [...result].sort((a, b) => getPrice(b) - getPrice(a));
    } else if (sortOrder === "price-asc") {
      result = [...result].sort((a, b) => getPrice(a) - getPrice(b));
    } else if (sortOrder === "release-desc") {
      result = [...result].sort((a, b) => (b.setReleaseDate ?? "").localeCompare(a.setReleaseDate ?? ""));
    } else if (sortOrder === "release-asc") {
      result = [...result].sort((a, b) => (a.setReleaseDate ?? "").localeCompare(b.setReleaseDate ?? ""));
    } else if (sortOrder === "number-desc") {
      result = [...result].sort((a, b) => (b.cardNumber ?? "").localeCompare(a.cardNumber ?? "", undefined, { numeric: true }));
    } else if (sortOrder === "number-asc") {
      result = [...result].sort((a, b) => (a.cardNumber ?? "").localeCompare(b.cardNumber ?? "", undefined, { numeric: true }));
    } else if (sortOrder === "added-desc") {
      result = [...result].sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
    }

    return result;
  }, [
    cards,
    search,
    rarity,
    energy,
    category,
    excludeCommonUncommon,
    duplicatesOnly,
    sortOrder,
    cardPricesByMasterCardId,
    sharedWishlistOwnedFilter,
    variant,
    ownedFilterOnly,
    viewerOwnedMasterCardIds,
  ]);

  const ownedFilterTag =
    sharedWishlistOwnedFilter && variant === "wishlist" && viewerOwnedMasterCardIds
      ? {
          active: ownedFilterOnly,
          onToggle: () => setOwnedFilterOnly((v) => !v),
        }
      : undefined;

  return (
    <div className="px-4">
      <CardGrid
        cards={filteredCards}
        setLogosByCode={setLogosByCode}
        setSymbolsByCode={setSymbolsByCode}
        variant={variant}
        customerLoggedIn={!readOnly}
        readOnly={readOnly}
        viewerOwnedMasterCardIds={viewerOwnedMasterCardIds}
        collectionSectionTitle={collectionSectionTitle}
        itemConditions={itemConditions}
        wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
        collectionLinesByMasterCardId={collectionLinesByMasterCardId}
        cardPricesByMasterCardId={cardPricesByMasterCardId}
        manualPriceMasterCardIds={manualPriceMasterCardIds}
        gradingByMasterCardId={gradingByMasterCardId}
        groupBySet={groupBySet}
        collectedCountBySetCode={groupBySet ? collectedCountBySetCode : undefined}
        tradePickMode={tradePickMode}
        tradeSelectedQtyByEntryId={tradeSelectedQtyByEntryId}
        onTradePickEntry={onTradePickEntry}
      />
    </div>
  );
}
