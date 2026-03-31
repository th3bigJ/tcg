import { cache } from "react";

import {
  fetchItemConditionOptions,
  groupCollectionLinesByMasterCardId,
  type CollectionLineSummary,
} from "@/lib/storefrontCardMaps";
import { fetchCollectionCardEntries, fetchWishlistIdsByMasterCard } from "@/lib/storefrontCardMapsServer";

export type SearchCardDataPayload = {
  itemConditions: { id: string; name: string }[];
  wishlistMap: Record<string, { id: string; printing?: string }>;
  collectionLines: Record<string, CollectionLineSummary[]>;
};

export const getSearchCardDataForCustomer = cache(async function getSearchCardDataForCustomer(
  customerId: string,
): Promise<SearchCardDataPayload> {
  const [itemConditions, collectionEntries, wishlistMap] = await Promise.all([
    fetchItemConditionOptions(),
    fetchCollectionCardEntries(customerId),
    fetchWishlistIdsByMasterCard(customerId),
  ]);

  return {
    itemConditions,
    wishlistMap,
    collectionLines: groupCollectionLinesByMasterCardId(collectionEntries),
  };
});
