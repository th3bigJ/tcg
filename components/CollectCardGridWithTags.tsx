"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function readSortOrderForScope(filterScope: PersistedFilterScope | undefined, readOnly: boolean): SortOrder {
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
  /** Trade wizard: tap tiles to select line quantities */
  tradePickMode?: boolean;
  tradeSelectedQtyByEntryId?: Record<string, number>;
  onTradePickEntry?: (entryId: string, card: CardEntry, maxQty: number) => void;
  initialVisibleCount?: number;
  loadMoreStep?: number;
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
  tradePickMode = false,
  tradeSelectedQtyByEntryId,
  onTradePickEntry,
  initialVisibleCount = 105,
  loadMoreStep = 42,
}: CollectCardGridWithTagsProps) {
  const [groupBySet, setGroupBySet] = useState(false);
  const [rarity, setRarity] = useState("");
  const [energy, setEnergy] = useState("");
  const [category, setCategory] = useState("");
  const [excludeCommonUncommon, setExcludeCommonUncommon] = useState(false);
  const [excludeCollected, setExcludeCollected] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(readOnly ? "price-asc" : "price-desc");
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
      setSortOrder(readSortOrderForScope(filterScope, readOnly));
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
    const viewerOwnsCard = (masterCardId: string | null | undefined) => {
      if (!masterCardId) return false;
      if (viewerOwnedMasterCardIds) return viewerOwnedMasterCardIds.has(masterCardId);
      return (collectionLinesByMasterCardId[masterCardId]?.length ?? 0) > 0;
    };
    let result = cards.filter((card) => {
      if (ownedFilterOnly && card.masterCardId) {
        if (!viewerOwnsCard(card.masterCardId)) return false;
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
    rarity,
    energy,
    category,
    excludeCommonUncommon,
    excludeCollected,
    sortOrder,
    cardPricesByMasterCardId,
    effectiveCollectionPriceRangeByMasterCardId,
    variant,
    ownedFilterOnly,
    collectionLinesByMasterCardId,
    viewerOwnedMasterCardIds,
    readOnly,
  ]);
  const sliceKey = [
    effectiveGroupBySet ? "grouped" : "flat",
    filteredCards.length,
    rarity,
    energy,
    category,
    excludeCommonUncommon ? "1" : "0",
    excludeCollected ? "1" : "0",
    ownedFilterOnly ? "1" : "0",
    sortOrder,
    variant,
    readOnly ? "1" : "0",
  ].join("|");

  return (
    <VisibleCollectCardGrid
      key={sliceKey}
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
      initialVisibleCount={initialVisibleCount}
      loadMoreStep={loadMoreStep}
    />
  );
}

type VisibleCollectCardGridProps = {
  cards: (CardEntry & Pick<StorefrontCardExtras, "addedAt">)[];
  setLogosByCode: Record<string, string>;
  setSymbolsByCode: Record<string, string>;
  variant: "collection" | "wishlist";
  customerLoggedIn: boolean;
  readOnly: boolean;
  viewerOwnedMasterCardIds?: Set<string>;
  collectionSectionTitle?: string;
  itemConditions: { id: string; name: string }[];
  wishlistEntryIdsByMasterCardId: Record<string, { id: string; printing?: string }>;
  collectionLinesByMasterCardId: Record<string, CollectionLineSummary[]>;
  cardPricesByMasterCardId: Record<string, number>;
  manualPriceMasterCardIds?: Set<string>;
  gradingByMasterCardId?: Record<string, { company: string; grade: string; imageUrl?: string }>;
  groupBySet: boolean;
  collectedCountBySetCode?: Record<string, number>;
  tradePickMode: boolean;
  tradeSelectedQtyByEntryId?: Record<string, number>;
  onTradePickEntry?: (entryId: string, card: CardEntry, maxQty: number) => void;
  initialVisibleCount: number;
  loadMoreStep: number;
};

function VisibleCollectCardGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  variant,
  customerLoggedIn,
  readOnly,
  viewerOwnedMasterCardIds,
  collectionSectionTitle,
  itemConditions,
  wishlistEntryIdsByMasterCardId,
  collectionLinesByMasterCardId,
  cardPricesByMasterCardId,
  manualPriceMasterCardIds,
  gradingByMasterCardId,
  groupBySet,
  collectedCountBySetCode,
  tradePickMode,
  tradeSelectedQtyByEntryId,
  onTradePickEntry,
  initialVisibleCount,
  loadMoreStep,
}: VisibleCollectCardGridProps) {
  const revealAll = groupBySet;
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const [visibleCount, setVisibleCount] = useState(() =>
    revealAll ? cards.length : Math.min(cards.length, initialVisibleCount),
  );

  useEffect(() => {
    if (revealAll || visibleCount >= cards.length) return;
    const button = loadMoreRef.current;
    if (!button) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((current) => Math.min(cards.length, current + loadMoreStep));
        }
      },
      { rootMargin: "0px 0px 200px 0px", threshold: 0 },
    );

    observer.observe(button);
    return () => observer.disconnect();
  }, [cards.length, loadMoreStep, revealAll, visibleCount]);

  const visibleCards = useMemo(
    () => (revealAll ? cards : cards.slice(0, visibleCount)),
    [cards, revealAll, visibleCount],
  );
  const canLoadMore = !revealAll && visibleCount < cards.length;

  return (
    <div className="px-4">
      <CardGrid
        cards={visibleCards}
        setLogosByCode={setLogosByCode}
        setSymbolsByCode={setSymbolsByCode}
        variant={variant}
        customerLoggedIn={customerLoggedIn}
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
      {canLoadMore ? (
        <div className="flex items-center justify-center pb-[var(--bottom-nav-offset,0px)] pt-6">
          <button
            ref={loadMoreRef}
            type="button"
            onClick={() => setVisibleCount((current) => Math.min(cards.length, current + loadMoreStep))}
            className="rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
          >
            Load {Math.min(loadMoreStep, cards.length - visibleCount)} more
          </button>
        </div>
      ) : null}
    </div>
  );
}
