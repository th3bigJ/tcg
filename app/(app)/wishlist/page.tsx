import Link from "next/link";

import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { CollectWishlistValueBreakdown } from "@/components/CollectWishlistValueBreakdown";
import { WishlistGridClient } from "@/components/WishlistGridClient";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchPriceSummariesForMasterCardIds } from "@/lib/cardPricingBulk";
import type { CollectGridSealedRow } from "@/lib/collectGridSealed";
import { getCachedFilterFacets } from "@/lib/cardsPageQueries";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { estimateCollectionMarketValueGbp, estimateCardUnitPricesGbp } from "@/lib/collectionMarketValueGbp";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { getSealedPriceTrends } from "@/lib/r2SealedPriceTrends";
import { estimateSealedMarketValueGbp, formatSealedUnitPriceGbp, sealedUnitPriceSortGbp } from "@/lib/sealedMarketValueGbp";
import {
  collectionGroupKeyFromEntry,
  fetchItemConditionOptions,
  groupCollectionLinesByGroupKey,
  groupCollectionLinesByMasterCardId,
} from "@/lib/storefrontCardMaps";
import {
  fetchCollectionCardEntries,
  fetchWishlistCardEntries,
  fetchWishlistIdsByMasterCard,
} from "@/lib/storefrontCardMapsServer";
import { mapSealedWishlistLinesToGrid } from "@/lib/sealedCustomerItems";
import {
  fetchSealedCollectionLines,
  fetchSealedWishlistLines,
  resolveSealedProductsByIds,
} from "@/lib/sealedCustomerItemsServer";

type WishlistPageProps = {
  searchParams?: Promise<{ group_by_set?: string }>;
};

export default async function WishlistPage({ searchParams }: WishlistPageProps) {
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-6 pt-[var(--mobile-page-top-offset)] text-[var(--foreground)]">
        <h1 className="text-xl font-semibold">Wishlist</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">
          Sign in to save cards you want to pick up.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-fit rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const groupBySet = resolvedSearchParams.group_by_set === "1";

  const [
    entries,
    sealedWishlistLines,
    sealedCollectionLines,
    multipliers,
    sealedTrendMap,
    collectionEntries,
    itemConditions,
    wishlistEntryIdsByMasterCardId,
    facets,
  ] = await Promise.all([
    fetchWishlistCardEntries(customer.id),
    fetchSealedWishlistLines(customer.id),
    fetchSealedCollectionLines(customer.id),
    fetchGbpConversionMultipliers(),
    getSealedPriceTrends(),
    fetchCollectionCardEntries(customer.id),
    fetchItemConditionOptions(),
    fetchWishlistIdsByMasterCard(customer.id),
    getCachedFilterFacets().then((r) => r ?? {}),
  ]);
  const collectionSealedProductIds = new Set(sealedCollectionLines.map((l) => l.sealedProductId));
  const sealedWishIds = [...new Set(sealedWishlistLines.map((l) => l.sealedProductId))];
  const sealedWishProductMap = await resolveSealedProductsByIds(sealedWishIds);
  const sealedWishGrid = mapSealedWishlistLinesToGrid(sealedWishlistLines, sealedWishProductMap);
  const sealedWishItems: CollectGridSealedRow[] = sealedWishGrid.map((g) => ({
    sealedProductId: g.sealedProductId,
    source: "wishlist",
    wishlistEntryId: g.wishlistEntryId,
    totalQuantity: 1,
    sealedQuantity: 1,
    openedQuantity: 0,
    sealedEntryIds: [],
    name: g.product?.name ?? `Product #${g.sealedProductId}`,
    imageUrl: g.product?.imageUrl ?? null,
    series: g.product?.series?.trim() || null,
    priceLabel: formatSealedUnitPriceGbp(g.product ?? null, multipliers.usdToGbp),
    priceSortGbp: sealedUnitPriceSortGbp(g.product ?? null, multipliers.usdToGbp),
    trend: sealedTrendMap?.[String(g.sealedProductId)] ?? null,
    releaseDate: g.product?.release_date ?? null,
    addedAt: g.addedAt,
  }));

  const allCardsForGrid = entries.map((e) => ({
    ...e,
    collectionGroupKey: collectionGroupKeyFromEntry(e),
  }));
  const uniqueMasterCardIds = [
    ...new Set(
      allCardsForGrid
        .map((card) => card.masterCardId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ];

  const collectionLinesByMasterCardId = {
    ...groupCollectionLinesByMasterCardId(collectionEntries),
    ...groupCollectionLinesByGroupKey(collectionEntries),
  };
  const setFilterOptions = await getCachedSetFilterOptions(facets.setCodes ?? []);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );

  const [wishlistValue, pricesResult, priceSummaryResult, sealedWishValueGbp] = await Promise.all([
    entries.length > 0 ? estimateCollectionMarketValueGbp(entries) : Promise.resolve(null),
    entries.length > 0
      ? estimateCardUnitPricesGbp(entries)
      : Promise.resolve({ prices: {}, manualPriceIds: new Set<string>() }),
    uniqueMasterCardIds.length > 0
      ? fetchPriceSummariesForMasterCardIds(uniqueMasterCardIds)
      : Promise.resolve({ prices: {}, trends: {} }),
    sealedWishGrid.length > 0
      ? estimateSealedMarketValueGbp(
          sealedWishGrid.map((g) => ({ product: g.product, quantity: 1 })),
          multipliers.usdToGbp,
        )
      : Promise.resolve(0),
  ]);
  const cardPricesByMasterCardId = pricesResult.prices;
  const cardPriceTrendsByMasterCardId = priceSummaryResult.trends;

  const cardValueGbp = wishlistValue?.totalGbp ?? 0;
  const hasAnyItems = allCardsForGrid.length > 0 || sealedWishItems.length > 0;
  const cardInventoryLabel = `${allCardsForGrid.length} card${allCardsForGrid.length === 1 ? "" : "s"}`;
  const sealedInventoryLabel = `${sealedWishItems.length} sealed`;

  const scrollRestoreKey = ["wishlist", groupBySet ? "grouped" : "flat"].join("|");

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      {hasAnyItems ? (
        <CollectWishlistValueBreakdown
          cardValueGbp={cardValueGbp}
          sealedValueGbp={sealedWishValueGbp}
          cardInventoryLabel={cardInventoryLabel}
          sealedInventoryLabel={sealedInventoryLabel}
        />
      ) : null}
      {allCardsForGrid.length === 0 && sealedWishItems.length === 0 ? (
        <p className="mt-4 px-4 max-w-md text-sm text-[var(--foreground)]/70">
          Save cards from Search with the heart on the card preview — or heart sealed products on a product page.
        </p>
      ) : (
        <div className="mt-6">
          <CardsResultsScroll
            canLoadMore={false}
            loadMoreHref="/wishlist"
            loadMoreStep={42}
            scrollRestoreKey={scrollRestoreKey}
            scrollsWindow
          >
            <div className="pb-4">
              {allCardsForGrid.length > 0 || sealedWishItems.length > 0 ? (
                <WishlistGridClient
                  cards={allCardsForGrid}
                  setLogosByCode={setLogosByCode}
                  setSymbolsByCode={setSymbolsByCode}
                  variant="wishlist"
                  routeGroupBySet={groupBySet}
                  filterScope="wishlist"
                  itemConditions={itemConditions}
                  wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
                  collectionLinesByMasterCardId={collectionLinesByMasterCardId}
                  cardPricesByMasterCardId={cardPricesByMasterCardId}
                  cardPriceTrendsByMasterCardId={cardPriceTrendsByMasterCardId}
                  sealedRows={sealedWishItems}
                  viewerOwnedSealedProductIds={collectionSealedProductIds}
                  collectionSealedProductIds={collectionSealedProductIds}
                />
              ) : null}
            </div>
          </CardsResultsScroll>
        </div>
      )}
    </div>
  );
}
