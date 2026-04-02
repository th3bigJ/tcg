import {
  fetchItemConditionOptions,
  groupCollectionLinesByMasterCardId,
  type CollectionLineSummary,
  type WishlistEntriesByMasterCardId,
} from "@/lib/storefrontCardMaps";
import { fetchCollectionCardEntries, fetchWishlistIdsByMasterCard } from "@/lib/storefrontCardMapsServer";

export type SearchCardDataPayload = {
  itemConditions: { id: string; name: string }[];
  wishlistMap: WishlistEntriesByMasterCardId;
  collectionLines: Record<string, CollectionLineSummary[]>;
};

export async function getSearchCardDataForCustomer(
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
}
