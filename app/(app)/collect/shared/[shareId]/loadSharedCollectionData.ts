import { notFound } from "next/navigation";

import { getCachedFilterFacets } from "@/lib/cardsPageQueries";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { displayCustomerName } from "@/lib/customerProfileShares";
import { getActiveShareForParticipant } from "@/lib/customerProfileSharesServer";
import { sortCollectGridRowsByPriceDesc } from "@/lib/collectGridSort";
import { estimateCardUnitPricesGbp } from "@/lib/collectionMarketValueGbp";
import {
  collectionGroupKeyFromEntry,
  fetchItemConditionOptions,
  groupCollectionLinesByGroupKey,
  groupCollectionLinesByMasterCardId,
  mergeCollectionEntriesForGrid,
  type StorefrontCardEntry,
  type WishlistEntriesByMasterCardId,
} from "@/lib/storefrontCardMaps";
import {
  fetchCollectionCardEntries,
  fetchWishlistCardEntries,
  fetchWishlistIdsByMasterCard,
} from "@/lib/storefrontCardMapsServer";

export type SharedCollectionLoaderResult = {
  shareId: string;
  pageTitle: string;
  ownerDisplayName: string;
  collectionCards: StorefrontCardEntry[];
  wishlistCards: StorefrontCardEntry[];
  setLogosByCode: Record<string, string>;
  setSymbolsByCode: Record<string, string>;
  itemConditions: Awaited<ReturnType<typeof fetchItemConditionOptions>>;
  wishlistEntryIdsByMasterCardId: WishlistEntriesByMasterCardId;
  collectionLinesByMasterCardId: Record<string, import("@/lib/storefrontCardMaps").CollectionLineSummary[]>;
  collectionCardPricesByMasterCardId: Record<string, number>;
  wishlistCardPricesByMasterCardId: Record<string, number>;
  collectionManualPriceMasterCardIds: string[];
  wishlistManualPriceMasterCardIds: string[];
  gradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
  viewerOwnedMasterCardIds: string[];
};

export async function loadSharedCollectionData(
  shareId: string,
  customerId: string,
): Promise<SharedCollectionLoaderResult> {
  const resolved = await getActiveShareForParticipant(shareId, customerId);
  if (!resolved.ok) {
    notFound();
  }

  const ownerId = String(resolved.share.ownerCustomerId);
  const recipientId = String(resolved.share.recipientCustomerId!);
  const ownerName = displayCustomerName(resolved.owner);
  const otherName = displayCustomerName(resolved.otherParty);
  const pageTitle = resolved.viewerIsOwner ? `Shared with ${otherName}` : `${ownerName}'s collection`;

  const [collectionEntries, wishlistEntries, ownerCollectionEntries, recipientCollectionEntries, itemConditions, facets] =
    await Promise.all([
      fetchCollectionCardEntries(ownerId),
      fetchWishlistCardEntries(ownerId),
      fetchCollectionCardEntries(ownerId),
      fetchCollectionCardEntries(recipientId),
      fetchItemConditionOptions(),
      getCachedFilterFacets(),
    ]);

  const viewerCollectionEntries = resolved.viewerIsOwner ? ownerCollectionEntries : recipientCollectionEntries;

  const wishlistEntryIdsByMasterCardId = await fetchWishlistIdsByMasterCard(ownerId);
  const collectionLinesByMasterCardId = {
    ...groupCollectionLinesByMasterCardId(collectionEntries),
    ...groupCollectionLinesByGroupKey(collectionEntries),
  };

  const gradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }> = {};
  for (const e of collectionEntries) {
    if (e.gradingCompany && e.gradeValue) {
      gradingByMasterCardId[collectionGroupKeyFromEntry(e)] = {
        company: e.gradingCompany,
        grade: e.gradeValue,
        imageUrl: e.gradedImageUrl,
      };
    }
  }

  const allCollectionForGrid = mergeCollectionEntriesForGrid(collectionEntries);
  const wishlistForGrid = wishlistEntries.map((e) => ({
    ...e,
    collectionGroupKey: collectionGroupKeyFromEntry(e),
  }));

  const setFilterOptions = await getCachedSetFilterOptions((facets ?? {}).setCodes ?? []);
  const setLogosByCode = Object.fromEntries(setFilterOptions.map((option) => [option.code, option.logoSrc]));
  const setSymbolsByCode = Object.fromEntries(setFilterOptions.map((option) => [option.code, option.symbolSrc]));

  const [cPricesResult, wPricesResult] = await Promise.all([
    collectionEntries.length > 0
      ? estimateCardUnitPricesGbp(collectionEntries)
      : Promise.resolve({ prices: {} as Record<string, number>, manualPriceIds: new Set<string>() }),
    wishlistEntries.length > 0
      ? estimateCardUnitPricesGbp(wishlistEntries)
      : Promise.resolve({ prices: {} as Record<string, number>, manualPriceIds: new Set<string>() }),
  ]);

  const collectionSorted =
    allCollectionForGrid.length > 0
      ? sortCollectGridRowsByPriceDesc(allCollectionForGrid, cPricesResult.prices)
      : allCollectionForGrid;
  const wishlistSorted =
    wishlistForGrid.length > 0
      ? sortCollectGridRowsByPriceDesc(wishlistForGrid, wPricesResult.prices)
      : wishlistForGrid;

  const viewerOwnedMasterCardIds = [
    ...new Set(
      viewerCollectionEntries.map((e) => e.masterCardId).filter((id): id is string => Boolean(id)),
    ),
  ];

  const collectionCardPricesByMasterCardId: Record<string, number> = { ...cPricesResult.prices };
  for (const [mid, lines] of Object.entries(collectionLinesByMasterCardId)) {
    if (mid.includes("|")) continue;
    let highest: number | null = null;
    for (const line of lines) {
      if ((line.gradingCompany?.trim() ?? "") && (line.gradeValue?.trim() ?? "")) continue;
      if ((line.conditionId?.trim() ?? "").toLowerCase() === "graded") continue;
      if ((line.conditionLabel?.trim() ?? "").toLowerCase() === "graded") continue;
      const groupKey = collectionGroupKeyFromEntry({
        masterCardId: mid,
        conditionLabel: line.conditionLabel,
        printing: line.printing,
        language: line.language,
        gradingCompany: line.gradingCompany,
        gradeValue: line.gradeValue,
      });
      const price = collectionCardPricesByMasterCardId[groupKey];
      if (typeof price !== "number" || !Number.isFinite(price)) continue;
      highest = highest === null ? price : Math.max(highest, price);
    }
    if (highest !== null) collectionCardPricesByMasterCardId[mid] = highest;
  }

  return {
    shareId,
    pageTitle,
    ownerDisplayName: ownerName,
    collectionCards: collectionSorted,
    wishlistCards: wishlistSorted,
    setLogosByCode,
    setSymbolsByCode,
    itemConditions,
    wishlistEntryIdsByMasterCardId,
    collectionLinesByMasterCardId,
    collectionCardPricesByMasterCardId,
    wishlistCardPricesByMasterCardId: wPricesResult.prices,
    collectionManualPriceMasterCardIds: [...cPricesResult.manualPriceIds],
    wishlistManualPriceMasterCardIds: [...wPricesResult.manualPriceIds],
    gradingByMasterCardId,
    viewerOwnedMasterCardIds,
  };
}
