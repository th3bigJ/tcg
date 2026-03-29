import Link from "next/link";
import { notFound } from "next/navigation";

import { SharedCollectionDetailClient } from "@/app/(app)/collect/shared/[shareId]/SharedCollectionDetailClient";
import { getCurrentCustomer } from "@/lib/auth";
import { getCachedFilterFacets } from "@/lib/cardsPageQueries";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { displayCustomerName } from "@/lib/customerProfileShares";
import { getActiveShareForRecipient } from "@/lib/customerProfileSharesServer";
import { sortCollectGridRowsByPriceDesc } from "@/lib/collectGridSort";
import { estimateCardUnitPricesGbp } from "@/lib/collectionMarketValueGbp";
import {
  collectionGroupKeyFromEntry,
  fetchItemConditionOptions,
  groupCollectionLinesByGroupKey,
  mergeCollectionEntriesForGrid,
} from "@/lib/storefrontCardMaps";
import {
  fetchCollectionCardEntries,
  fetchWishlistCardEntries,
  fetchWishlistIdsByMasterCard,
} from "@/lib/storefrontCardMapsServer";

type PageProps = {
  params: Promise<{ shareId: string }>;
};

export default async function SharedCollectionDetailPage({ params }: PageProps) {
  const { shareId } = await params;
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
        <h1 className="text-xl font-semibold">Shared collection</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">Sign in to view shared collections.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-fit rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const resolved = await getActiveShareForRecipient(shareId, customer.id);
  if (!resolved.ok) {
    notFound();
  }

  const ownerId = String(resolved.share.ownerCustomerId);
  const ownerName = displayCustomerName(resolved.owner);

  const [
    collectionEntries,
    wishlistEntries,
    viewerCollectionEntries,
    itemConditions,
    facets,
  ] = await Promise.all([
    fetchCollectionCardEntries(ownerId),
    fetchWishlistCardEntries(ownerId),
    fetchCollectionCardEntries(customer.id),
    fetchItemConditionOptions(),
    getCachedFilterFacets(),
  ]);

  const wishlistEntryIdsByMasterCardId = await fetchWishlistIdsByMasterCard(ownerId);
  const collectionLinesByMasterCardId = groupCollectionLinesByGroupKey(collectionEntries);

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

  return (
    <SharedCollectionDetailClient
      ownerDisplayName={ownerName}
      collectionCards={collectionSorted}
      wishlistCards={wishlistSorted}
      setLogosByCode={setLogosByCode}
      setSymbolsByCode={setSymbolsByCode}
      itemConditions={itemConditions}
      wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
      collectionLinesByMasterCardId={collectionLinesByMasterCardId}
      collectionCardPricesByMasterCardId={cPricesResult.prices}
      wishlistCardPricesByMasterCardId={wPricesResult.prices}
      collectionManualPriceMasterCardIds={[...cPricesResult.manualPriceIds]}
      wishlistManualPriceMasterCardIds={[...wPricesResult.manualPriceIds]}
      gradingByMasterCardId={gradingByMasterCardId}
      viewerOwnedMasterCardIds={viewerOwnedMasterCardIds}
    />
  );
}
