"use client";

import { useMemo, useState } from "react";
import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { CardTagFilterRow } from "@/components/CardTagFilterRow";
import type { CollectionLineSummary, StorefrontCardExtras } from "@/lib/storefrontCardMaps";

const COMMON_UNCOMMON = new Set(["Common", "Uncommon"]);

type SortOrder = "" | "price-desc" | "release-desc" | "added-desc";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "", label: "Sort" },
  { value: "price-desc", label: "Price" },
  { value: "release-desc", label: "Release date" },
  { value: "added-desc", label: "Added date" },
];

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
  const [rarity, setRarity] = useState("");
  const [category, setCategory] = useState("");
  const [excludeCommonUncommon, setExcludeCommonUncommon] = useState(false);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("price-desc");
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
    const seen = new Set<string>();
    for (const card of cards) if (card.rarity) seen.add(card.rarity);
    return Array.from(seen).sort();
  }, [cards]);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const card of cards) if (card.category) seen.add(card.category);
    return Array.from(seen).sort();
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
      if (category && card.category !== category) return false;
      if (excludeCommonUncommon && COMMON_UNCOMMON.has(card.rarity)) return false;
      if (duplicatesOnly && (card.quantity ?? 1) <= 1) return false;
      return true;
    });

    if (sortOrder === "price-desc") {
      result = [...result].sort((a, b) => {
        const ka = a.collectionGroupKey ?? a.masterCardId ?? "";
        const kb = b.collectionGroupKey ?? b.masterCardId ?? "";
        const pa = (ka ? cardPricesByMasterCardId[ka] : undefined) ?? 0;
        const pb = (kb ? cardPricesByMasterCardId[kb] : undefined) ?? 0;
        return pb - pa;
      });
    } else if (sortOrder === "release-desc") {
      result = [...result].sort((a, b) =>
        (b.setReleaseDate ?? "").localeCompare(a.setReleaseDate ?? ""),
      );
    } else if (sortOrder === "added-desc") {
      result = [...result].sort((a, b) =>
        (b.addedAt ?? "").localeCompare(a.addedAt ?? ""),
      );
    }

    return result;
  }, [
    cards,
    search,
    rarity,
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
      <div className="mb-6">
        <CardTagFilterRow
          groupBySet={groupBySet}
          onGroupBySetChange={setGroupBySet}
          localSearch={{ value: search, onChange: setSearch }}
          localFilters={{
            rarity,
            onRarityChange: setRarity,
            rarityOptions,
            category,
            onCategoryChange: setCategory,
            categoryOptions,
            excludeCommonUncommon,
            onExcludeCommonUncommonChange: setExcludeCommonUncommon,
            duplicatesOnly: variant === "collection" ? duplicatesOnly : undefined,
            onDuplicatesOnlyChange: variant === "collection" ? setDuplicatesOnly : undefined,
          }}
          sortControl={{
            value: sortOrder,
            onChange: (v) => setSortOrder(v as SortOrder),
            options: SORT_OPTIONS,
            defaultValue: "price-desc",
          }}
          ownedFilterTag={ownedFilterTag}
        />
      </div>
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
