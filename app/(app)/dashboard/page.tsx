import { DashboardShell } from "@/components/DashboardShell";
import { getCurrentCustomer } from "@/lib/auth";
import { estimateCollectionMarketValueGbp } from "@/lib/collectionMarketValueGbp";
import { collectionCopyTotalFromEntries } from "@/lib/storefrontCardMaps";
import {
  fetchCollectionCardEntries,
  fetchWishlistCardEntries,
} from "@/lib/storefrontCardMapsServer";

export default async function DashboardPage() {
  const customer = await getCurrentCustomer();
  const displayName =
    customer?.firstName?.trim() || customer?.email?.split("@")[0]?.trim() || "Trainer";

  const [collectionValueLabel, cardsOwnedCount, wishlistCount] = customer
    ? await (async () => {
        const [collectionEntries, wishlistEntries] = await Promise.all([
          fetchCollectionCardEntries(customer.id),
          fetchWishlistCardEntries(customer.id),
        ]);
        const collectionValue =
          collectionEntries.length > 0 ? await estimateCollectionMarketValueGbp(collectionEntries) : null;

        return [
          collectionValue && collectionValue.totalGbp > 0
            ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                collectionValue.totalGbp,
              )
            : "£0.00",
          collectionCopyTotalFromEntries(collectionEntries),
          wishlistEntries.length,
        ] as const;
      })()
    : (["£0.00", 0, 0] as const);

  return (
    <DashboardShell
      isLoggedIn={Boolean(customer)}
      displayName={displayName}
      collectionValueLabel={collectionValueLabel}
      cardsOwnedCount={cardsOwnedCount}
      wishlistCount={wishlistCount}
    />
  );
}
