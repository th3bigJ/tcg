import { DashboardShell } from "@/components/DashboardShell";
import { getCurrentCustomer } from "@/lib/auth";
import { mergePortfolioHistoryWithLiveToday } from "@/lib/portfolioChartPoints";
import { fetchPortfolioSnapshotDocumentForServer } from "@/lib/r2PortfolioSnapshots";
import { estimateCardCollectionBucketsGbp } from "@/lib/collectionMarketValueGbp";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { mergeSealedCollectionForGrid } from "@/lib/sealedCustomerItems";
import { estimateSealedMarketValueGbp } from "@/lib/sealedMarketValueGbp";
import { fetchSealedCollectionLines, resolveSealedProductsByIds } from "@/lib/sealedCustomerItemsServer";
import {
  collectionCardCopyBucketsFromEntries,
  collectionCopyTotalFromEntries,
} from "@/lib/storefrontCardMaps";
import {
  fetchCollectionCardEntries,
  fetchWishlistCardEntries,
} from "@/lib/storefrontCardMapsServer";

function formatGbp(n: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    Number.isFinite(n) && n > 0 ? n : 0,
  );
}

export default async function DashboardPage() {
  const customer = await getCurrentCustomer();
  const displayName =
    customer?.firstName?.trim() || customer?.email?.split("@")[0]?.trim() || "Trainer";

  const [
    collectionValueLabel,
    singleCardsValueLabel,
    gradedValueLabel,
    sealedValueLabel,
    cardsOwnedCount,
    wishlistCount,
    gradedCopies,
    singleCopies,
    packedCopies,
    sealedCopies,
    portfolioHistoryPoints,
  ] = customer
    ? await (async () => {
        const [collectionEntries, wishlistEntries, sealedLines, multipliers, portfolioDoc] = await Promise.all([
          fetchCollectionCardEntries(customer.id),
          fetchWishlistCardEntries(customer.id),
          fetchSealedCollectionLines(customer.id),
          fetchGbpConversionMultipliers(),
          fetchPortfolioSnapshotDocumentForServer(customer.id),
        ]);

        const cardBuckets =
          collectionEntries.length > 0
            ? await estimateCardCollectionBucketsGbp(collectionEntries)
            : { singleCardsGbp: 0, gradedCardsGbp: 0, rippedGbp: 0 };

        const sealedProductIds = [...new Set(sealedLines.map((l) => l.sealedProductId))];
        const sealedProductMap = await resolveSealedProductsByIds(sealedProductIds);
        const sealedForGrid = mergeSealedCollectionForGrid(sealedLines, sealedProductMap);
        const sealedCopyCount = sealedForGrid.reduce((sum, g) => sum + g.sealedQuantity, 0);

        const sealedValueGbp =
          sealedForGrid.length > 0
            ? await estimateSealedMarketValueGbp(
                sealedForGrid.map((g) => ({ product: g.product, quantity: g.sealedQuantity })),
                multipliers.usdToGbp,
              )
            : 0;

        const looseSinglesValueGbp = cardBuckets.singleCardsGbp + cardBuckets.rippedGbp;
        const cardsValueGbp = looseSinglesValueGbp + cardBuckets.gradedCardsGbp;
        const totalGbp = cardsValueGbp + sealedValueGbp;

        const buckets = collectionCardCopyBucketsFromEntries(collectionEntries);

        const historyFromFile =
          portfolioDoc?.points.map((p) => ({ date: p.date, totalValueGbp: p.totalValueGbp })) ?? [];
        const historyPoints = mergePortfolioHistoryWithLiveToday(historyFromFile, totalGbp);

        return [
          formatGbp(totalGbp),
          formatGbp(looseSinglesValueGbp),
          formatGbp(cardBuckets.gradedCardsGbp),
          formatGbp(sealedValueGbp),
          collectionCopyTotalFromEntries(collectionEntries),
          wishlistEntries.length,
          buckets.gradedCopies,
          buckets.singleCopies,
          buckets.packedCopies,
          sealedCopyCount,
          historyPoints,
        ] as const;
      })()
    : ([
        "£0.00",
        "£0.00",
        "£0.00",
        "£0.00",
        0,
        0,
        0,
        0,
        0,
        0,
        [] as { date: string; totalValueGbp: number }[],
      ] as const);

  return (
    <DashboardShell
      isLoggedIn={Boolean(customer)}
      displayName={displayName}
      collectionValueLabel={collectionValueLabel}
      singleCardsValueLabel={singleCardsValueLabel}
      gradedValueLabel={gradedValueLabel}
      sealedValueLabel={sealedValueLabel}
      cardsOwnedCount={cardsOwnedCount}
      wishlistCount={wishlistCount}
      gradedCopies={gradedCopies}
      singleCopies={singleCopies}
      packedCopies={packedCopies}
      sealedCopies={sealedCopies}
      portfolioHistoryPoints={portfolioHistoryPoints}
    />
  );
}
