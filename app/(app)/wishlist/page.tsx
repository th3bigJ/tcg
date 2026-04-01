import Link from "next/link";

import { CollectCardGridWithTags } from "@/components/CollectCardGridWithTags";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { getCurrentCustomer } from "@/lib/auth";
import { getCachedFilterFacets } from "@/lib/cardsPageQueries";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { paginateRowsByFullSets, sortCollectGridRowsByPriceDesc } from "@/lib/collectGridSort";
import { estimateCollectionMarketValueGbp, estimateCardUnitPricesGbp } from "@/lib/collectionMarketValueGbp";
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

const INITIAL_TAKE = 105;
const LOAD_MORE_STEP = 42;

type WishlistPageProps = {
  searchParams?: Promise<{ take?: string; set_take?: string; group_by_set?: string }>;
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
  const rawTake = Number.parseInt(resolvedSearchParams.take ?? "", 10);
  const rawSetTake = Number.parseInt(resolvedSearchParams.set_take ?? "", 10);
  const take = Number.isFinite(rawTake) && rawTake > 0 ? rawTake : INITIAL_TAKE;
  const setTake = Number.isFinite(rawSetTake) && rawSetTake > 0 ? rawSetTake : 1;
  const groupBySet = resolvedSearchParams.group_by_set === "1";

  const entries = await fetchWishlistCardEntries(customer.id);
  const allCardsForGrid = entries.map((e) => ({
    ...e,
    collectionGroupKey: collectionGroupKeyFromEntry(e),
  }));

  const [
    collectionEntries,
    itemConditions,
    wishlistEntryIdsByMasterCardId,
    facets,
  ] = await Promise.all([
    fetchCollectionCardEntries(customer.id),
    fetchItemConditionOptions(),
    fetchWishlistIdsByMasterCard(customer.id),
    getCachedFilterFacets().then((r) => r ?? {}),
  ]);

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

  const [wishlistValue, pricesResult] = await Promise.all([
    entries.length > 0 ? estimateCollectionMarketValueGbp(entries) : Promise.resolve(null),
    entries.length > 0
      ? estimateCardUnitPricesGbp(entries)
      : Promise.resolve({ prices: {}, manualPriceIds: new Set<string>() }),
  ]);
  const cardPricesByMasterCardId = pricesResult.prices;

  const allCardsSortedByPrice =
    allCardsForGrid.length > 0
      ? sortCollectGridRowsByPriceDesc(allCardsForGrid, cardPricesByMasterCardId)
      : allCardsForGrid;
  const groupedPage = groupBySet
    ? paginateRowsByFullSets(allCardsSortedByPrice, setTake)
    : null;
  const cardsForClient = groupBySet
    ? groupedPage.rowsForPage
    : allCardsSortedByPrice.slice(0, take);
  const totalCards = allCardsForGrid.length;

  const valueFormatted =
    wishlistValue && wishlistValue.totalGbp > 0
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
          wishlistValue.totalGbp,
        )
      : null;

  const showingCount = cardsForClient.length;
  const nextTake = Math.min(totalCards, showingCount + LOAD_MORE_STEP);
  const nextSetTake = groupBySet ? groupedPage.showingSetCount + 1 : setTake;
  const canLoadMore = groupBySet
    ? groupedPage.hasMoreSets
    : showingCount > 0 && showingCount < totalCards;
  const loadMoreParams = new URLSearchParams();
  if (groupBySet) {
    loadMoreParams.set("group_by_set", "1");
    loadMoreParams.set("set_take", String(nextSetTake));
  } else {
    loadMoreParams.set("take", String(nextTake));
  }
  const loadMoreHref = `/wishlist?${loadMoreParams.toString()}`;
  const scrollRestoreKey = [groupBySet ? String(groupedPage.showingSetCount) : String(take), "wishlist", groupBySet ? "grouped" : "flat"].join("|");

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <p className="mt-4 shrink-0 px-4 text-sm text-[var(--foreground)]/65">
        {allCardsForGrid.length} card{allCardsForGrid.length === 1 ? "" : "s"}
      </p>
      {valueFormatted ? (
        <p className="mt-1 shrink-0 px-4 text-base font-semibold tabular-nums text-[var(--foreground)]">
          {valueFormatted} <span className="text-sm font-normal text-[var(--foreground)]/55">Market value</span>
        </p>
      ) : null}
      {allCardsForGrid.length === 0 ? (
        <p className="mt-4 px-4 max-w-md text-sm text-[var(--foreground)]/70">
          Save cards from Search with the heart button on the card preview.
        </p>
      ) : (
        <div className="mt-6">
          <CardsResultsScroll
            canLoadMore={canLoadMore}
            loadMoreHref={loadMoreHref}
            loadMoreStep={groupBySet ? 1 : LOAD_MORE_STEP}
            scrollRestoreKey={scrollRestoreKey}
            scrollsWindow
          >
            <div className="pb-4">
              <CollectCardGridWithTags
                cards={cardsForClient}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                variant="wishlist"
                routeGroupBySet={groupBySet}
                filterScope="wishlist"
                itemConditions={itemConditions}
                wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
                collectionLinesByMasterCardId={collectionLinesByMasterCardId}
                cardPricesByMasterCardId={cardPricesByMasterCardId}
              />
            </div>
          </CardsResultsScroll>
        </div>
      )}
    </div>
  );
}
