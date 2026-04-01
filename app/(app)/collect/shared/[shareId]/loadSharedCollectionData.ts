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
  storefrontEntriesToTradeGridCards,
  type StorefrontCardEntry,
} from "@/lib/storefrontCardMaps";
import {
  fetchCollectionCardEntries,
  fetchWishlistCardEntries,
  fetchWishlistIdsByMasterCard,
} from "@/lib/storefrontCardMapsServer";

function gradingByGroupKeyFromEntries(
  entries: StorefrontCardEntry[],
): Record<string, { company: string; grade: string; imageUrl?: string }> {
  const out: Record<string, { company: string; grade: string; imageUrl?: string }> = {};
  for (const e of entries) {
    if (e.gradingCompany && e.gradeValue) {
      out[collectionGroupKeyFromEntry(e)] = {
        company: e.gradingCompany,
        grade: e.gradeValue,
        imageUrl: e.gradedImageUrl,
      };
    }
  }
  return out;
}

export type SharedCollectionLoaderResult = {
  shareId: string;
  viewerCustomerId: string;
  counterpartyDisplayName: string;
  pageTitle: string;
  ownerDisplayName: string;
  viewerCollectionEntries: StorefrontCardEntry[];
  counterpartyCollectionEntries: StorefrontCardEntry[];
  collectionCards: StorefrontCardEntry[];
  wishlistCards: StorefrontCardEntry[];
  setLogosByCode: Record<string, string>;
  setSymbolsByCode: Record<string, string>;
  itemConditions: Awaited<ReturnType<typeof fetchItemConditionOptions>>;
  wishlistEntryIdsByMasterCardId: Record<string, { id: string; printing?: string }>;
  collectionLinesByMasterCardId: Record<string, import("@/lib/storefrontCardMaps").CollectionLineSummary[]>;
  collectionCardPricesByMasterCardId: Record<string, number>;
  wishlistCardPricesByMasterCardId: Record<string, number>;
  collectionManualPriceMasterCardIds: string[];
  wishlistManualPriceMasterCardIds: string[];
  gradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
  viewerOwnedMasterCardIds: string[];
  viewerTradeGridCards: StorefrontCardEntry[];
  viewerTradeCardPricesByMasterCardId: Record<string, number>;
  viewerTradeCollectionLinesByMasterCardId: Record<
    string,
    import("@/lib/storefrontCardMaps").CollectionLineSummary[]
  >;
  viewerTradeManualPriceMasterCardIds: string[];
  viewerTradeGradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
  counterpartyTradeGridCards: StorefrontCardEntry[];
  counterpartyTradeCardPricesByMasterCardId: Record<string, number>;
  counterpartyTradeCollectionLinesByMasterCardId: Record<
    string,
    import("@/lib/storefrontCardMaps").CollectionLineSummary[]
  >;
  counterpartyTradeManualPriceMasterCardIds: string[];
  counterpartyTradeGradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
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
  const viewerCollectionForTrade = viewerCollectionEntries;
  const counterpartyCollectionForTrade = resolved.viewerIsOwner ? recipientCollectionEntries : ownerCollectionEntries;

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

  const [cPricesResult, wPricesResult, viewerTradePricesResult, counterpartyTradePricesResult] = await Promise.all([
    collectionEntries.length > 0
      ? estimateCardUnitPricesGbp(collectionEntries)
      : Promise.resolve({ prices: {} as Record<string, number>, manualPriceIds: new Set<string>() }),
    wishlistEntries.length > 0
      ? estimateCardUnitPricesGbp(wishlistEntries)
      : Promise.resolve({ prices: {} as Record<string, number>, manualPriceIds: new Set<string>() }),
    viewerCollectionForTrade.length > 0
      ? estimateCardUnitPricesGbp(viewerCollectionForTrade)
      : Promise.resolve({ prices: {} as Record<string, number>, manualPriceIds: new Set<string>() }),
    counterpartyCollectionForTrade.length > 0
      ? estimateCardUnitPricesGbp(counterpartyCollectionForTrade)
      : Promise.resolve({ prices: {} as Record<string, number>, manualPriceIds: new Set<string>() }),
  ]);

  const viewerTradeGridRaw = storefrontEntriesToTradeGridCards(viewerCollectionForTrade);
  const counterpartyTradeGridRaw = storefrontEntriesToTradeGridCards(counterpartyCollectionForTrade);
  const viewerTradeGridSorted =
    viewerTradeGridRaw.length > 0
      ? sortCollectGridRowsByPriceDesc(viewerTradeGridRaw, viewerTradePricesResult.prices)
      : viewerTradeGridRaw;
  const counterpartyTradeGridSorted =
    counterpartyTradeGridRaw.length > 0
      ? sortCollectGridRowsByPriceDesc(counterpartyTradeGridRaw, counterpartyTradePricesResult.prices)
      : counterpartyTradeGridRaw;

  const viewerTradeLinesByMasterCardId = groupCollectionLinesByMasterCardId(viewerCollectionForTrade);
  const counterpartyTradeLinesByMasterCardId = groupCollectionLinesByMasterCardId(counterpartyCollectionForTrade);
  const viewerTradeGradingByMasterCardId = gradingByGroupKeyFromEntries(viewerCollectionForTrade);
  const counterpartyTradeGradingByMasterCardId = gradingByGroupKeyFromEntries(counterpartyCollectionForTrade);

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
    viewerCustomerId: customerId,
    counterpartyDisplayName: otherName,
    pageTitle,
    ownerDisplayName: ownerName,
    viewerCollectionEntries: viewerCollectionForTrade,
    counterpartyCollectionEntries: counterpartyCollectionForTrade,
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
    viewerTradeGridCards: viewerTradeGridSorted,
    viewerTradeCardPricesByMasterCardId: viewerTradePricesResult.prices,
    viewerTradeCollectionLinesByMasterCardId: viewerTradeLinesByMasterCardId,
    viewerTradeManualPriceMasterCardIds: [...viewerTradePricesResult.manualPriceIds],
    viewerTradeGradingByMasterCardId,
    counterpartyTradeGridCards: counterpartyTradeGridSorted,
    counterpartyTradeCardPricesByMasterCardId: counterpartyTradePricesResult.prices,
    counterpartyTradeCollectionLinesByMasterCardId: counterpartyTradeLinesByMasterCardId,
    counterpartyTradeManualPriceMasterCardIds: [...counterpartyTradePricesResult.manualPriceIds],
    counterpartyTradeGradingByMasterCardId,
  };
}
