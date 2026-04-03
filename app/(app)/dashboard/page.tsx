import { DashboardShell } from "@/components/DashboardShell";
import { getCurrentCustomer } from "@/lib/auth";
import { estimateCollectionMarketValueGbp } from "@/lib/collectionMarketValueGbp";
import { mergeSealedCollectionForGrid } from "@/lib/sealedCustomerItems";
import { fetchSealedCollectionLines, resolveSealedProductsByIds } from "@/lib/sealedCustomerItemsServer";
import {
  collectionCardCopyBucketsFromEntries,
  collectionCopyTotalFromEntries,
} from "@/lib/storefrontCardMaps";
import {
  fetchCollectionCardEntries,
  fetchWishlistCardEntries,
} from "@/lib/storefrontCardMapsServer";

export default async function DashboardPage() {
  const customer = await getCurrentCustomer();
  const displayName =
    customer?.firstName?.trim() || customer?.email?.split("@")[0]?.trim() || "Trainer";

  const [collectionValueLabel, cardsOwnedCount, wishlistCount, gradedCopies, singleCopies, packedCopies, sealedCopies] =
    customer
      ? await (async () => {
          const [collectionEntries, wishlistEntries, sealedLines] = await Promise.all([
            fetchCollectionCardEntries(customer.id),
            fetchWishlistCardEntries(customer.id),
            fetchSealedCollectionLines(customer.id),
          ]);
          const collectionValue =
            collectionEntries.length > 0 ? await estimateCollectionMarketValueGbp(collectionEntries) : null;

          const buckets = collectionCardCopyBucketsFromEntries(collectionEntries);
          const sealedProductIds = [...new Set(sealedLines.map((l) => l.sealedProductId))];
          const sealedProductMap = await resolveSealedProductsByIds(sealedProductIds);
          const sealedForGrid = mergeSealedCollectionForGrid(sealedLines, sealedProductMap);
          const sealedCopyCount = sealedForGrid.reduce((sum, g) => sum + g.sealedQuantity, 0);

          return [
            collectionValue && collectionValue.totalGbp > 0
              ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                  collectionValue.totalGbp,
                )
              : "£0.00",
            collectionCopyTotalFromEntries(collectionEntries),
            wishlistEntries.length,
            buckets.gradedCopies,
            buckets.singleCopies,
            buckets.packedCopies,
            sealedCopyCount,
          ] as const;
        })()
      : (["£0.00", 0, 0, 0, 0, 0, 0] as const);

  return (
    <DashboardShell
      isLoggedIn={Boolean(customer)}
      displayName={displayName}
      collectionValueLabel={collectionValueLabel}
      cardsOwnedCount={cardsOwnedCount}
      wishlistCount={wishlistCount}
      gradedCopies={gradedCopies}
      singleCopies={singleCopies}
      packedCopies={packedCopies}
      sealedCopies={sealedCopies}
    />
  );
}
