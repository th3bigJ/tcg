"use client";

import { useMemo, useState, useEffect } from "react";
import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { cardMatchesEnergyTypeSelection } from "@/lib/cardEnergyFilter";
import { isBasicRarity } from "@/lib/cardRarityFilter";
import {
  PERSISTED_FILTERS_UPDATED_EVENT,
  readPersistedFilters,
  type PersistedFilterScope,
} from "@/lib/persistedFilters";
import { collectionGroupKeyFromLine, type CollectionLineSummary, type StorefrontCardExtras } from "@/lib/storefrontCardMaps";

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
  routeGroupBySet?: boolean;
  filterScope?: PersistedFilterScope;
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
  routeGroupBySet,
  filterScope,
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
  const readLocalSortOrder = (): SortOrder => {
    const s = readPersistedFilters(filterScope).sort;
    if (
      s === "price-asc" ||
      s === "price-desc" ||
      s === "release-desc" ||
      s === "release-asc" ||
      s === "number-desc" ||
      s === "number-asc"
    ) {
      return s as SortOrder;
    }
    return readOnly ? "price-asc" : "price-desc";
  };
  const [groupBySet, setGroupBySet] = useState(false);
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState(() => readPersistedFilters(filterScope).rarity ?? "");
  const [energy, setEnergy] = useState(() => readPersistedFilters(filterScope).energy ?? "");
  const [category, setCategory] = useState(() => readPersistedFilters(filterScope).category ?? "");
  const [excludeCommonUncommon, setExcludeCommonUncommon] = useState(() => readPersistedFilters(filterScope).excludeCommonUncommon ?? false);
  const [excludeCollected, setExcludeCollected] = useState(() => readPersistedFilters(filterScope).excludeCollected ?? false);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(readLocalSortOrder);
  const [ownedFilterOnly, setOwnedFilterOnly] = useState(false);

  useEffect(() => {
    const syncPersistedFilters = () => {
      const persisted = readPersistedFilters(filterScope);
      setGroupBySet(persisted.groupBySet ?? false);
      setRarity(persisted.rarity ?? "");
      setEnergy(persisted.energy ?? "");
      setCategory(persisted.category ?? "");
      setExcludeCommonUncommon(persisted.excludeCommonUncommon ?? false);
      setExcludeCollected(persisted.excludeCollected ?? false);
      setOwnedFilterOnly(persisted.showOwnedOnly ?? false);
      setSortOrder(readLocalSortOrder());
    };

    syncPersistedFilters();
    window.addEventListener("storage", syncPersistedFilters);
    window.addEventListener("focus", syncPersistedFilters);
    window.addEventListener(PERSISTED_FILTERS_UPDATED_EVENT, syncPersistedFilters);
    return () => {
      window.removeEventListener("storage", syncPersistedFilters);
      window.removeEventListener("focus", syncPersistedFilters);
      window.removeEventListener(PERSISTED_FILTERS_UPDATED_EVENT, syncPersistedFilters);
    };
  }, [filterScope, readOnly]);
  const effectiveGroupBySet = routeGroupBySet ?? groupBySet;

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

  const effectiveCollectionPriceRangeByMasterCardId = useMemo(() => {
    const out: Record<string, { low: number; high: number }> = {};
    for (const [mid, lines] of Object.entries(collectionLinesByMasterCardId)) {
      if (mid.includes("|")) continue;
      let lowest: number | null = null;
      let highest: number | null = null;
      for (const line of lines) {
        if ((line.gradingCompany?.trim() ?? "") && (line.gradeValue?.trim() ?? "")) continue;
        if ((line.conditionId?.trim() ?? "").toLowerCase() === "graded") continue;
        if ((line.conditionLabel?.trim() ?? "").toLowerCase() === "graded") continue;
        const groupKey = collectionGroupKeyFromLine(mid, line);
        const price = cardPricesByMasterCardId[groupKey];
        if (typeof price !== "number" || !Number.isFinite(price)) continue;
        lowest = lowest === null ? price : Math.min(lowest, price);
        highest = highest === null ? price : Math.max(highest, price);
      }
      if (lowest !== null && highest !== null) out[mid] = { low: lowest, high: highest };
    }
    return out;
  }, [cardPricesByMasterCardId, collectionLinesByMasterCardId]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    const viewerOwnsCard = (masterCardId: string | null | undefined) => {
      if (!masterCardId) return false;
      if (viewerOwnedMasterCardIds) return viewerOwnedMasterCardIds.has(masterCardId);
      return (collectionLinesByMasterCardId[masterCardId]?.length ?? 0) > 0;
    };
    let result = cards.filter((card) => {
      if (ownedFilterOnly && card.masterCardId) {
        if (!viewerOwnsCard(card.masterCardId)) return false;
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
      if (excludeCommonUncommon && isBasicRarity(card.rarity)) return false;
      if (
        excludeCollected &&
        card.masterCardId &&
        (variant === "wishlist" || (readOnly && viewerOwnedMasterCardIds))
      ) {
        if (viewerOwnsCard(card.masterCardId)) return false;
      }
      if (duplicatesOnly && (card.quantity ?? 1) <= 1) return false;
      return true;
    });

    const getPrice = (card: typeof result[0]) => {
      const k = card.collectionGroupKey ?? card.masterCardId ?? "";
      if (k && cardPricesByMasterCardId[k] !== undefined) return cardPricesByMasterCardId[k] ?? 0;
      if (variant === "collection" && card.masterCardId) {
        const range = effectiveCollectionPriceRangeByMasterCardId[card.masterCardId];
        if (!range) return 0;
        return sortOrder === "price-asc" ? range.low : range.high;
      }
      return 0;
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
    excludeCollected,
    duplicatesOnly,
    sortOrder,
    cardPricesByMasterCardId,
    effectiveCollectionPriceRangeByMasterCardId,
    sharedWishlistOwnedFilter,
    variant,
    ownedFilterOnly,
    collectionLinesByMasterCardId,
    viewerOwnedMasterCardIds,
    readOnly,
  ]);

  const ownedFilterTag =
    (variant === "collection" ||
      variant === "wishlist" ||
      viewerOwnedMasterCardIds)
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
        groupBySet={effectiveGroupBySet}
        collectedCountBySetCode={effectiveGroupBySet ? collectedCountBySetCode : undefined}
        tradePickMode={tradePickMode}
        tradeSelectedQtyByEntryId={tradeSelectedQtyByEntryId}
        onTradePickEntry={onTradePickEntry}
      />
    </div>
  );
}
