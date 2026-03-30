import Link from "next/link";

import { CollectCardGridWithTags } from "@/components/CollectCardGridWithTags";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { getCurrentCustomer } from "@/lib/auth";
import { getCachedFilterFacets } from "@/lib/cardsPageQueries";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { sortCollectGridRowsByPriceDesc } from "@/lib/collectGridSort";
import { estimateCollectionMarketValueGbp, estimateCardUnitPricesGbp } from "@/lib/collectionMarketValueGbp";
import {
  collectionGroupKeyFromEntry,
  fetchItemConditionOptions,
  groupCollectionLinesByGroupKey,
  mergeCollectionEntriesForGrid,
  totalCopiesFromMergedGrid,
} from "@/lib/storefrontCardMaps";
import { fetchCollectionCardEntries, fetchWishlistIdsByMasterCard } from "@/lib/storefrontCardMapsServer";

const INITIAL_TAKE = 30;
const LOAD_MORE_STEP = 30;

type CollectPageProps = {
  searchParams?: Promise<{ take?: string }>;
};

export default async function CollectPage({ searchParams }: CollectPageProps) {
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-6 pt-[var(--mobile-page-top-offset)] text-[var(--foreground)]">
        <h1 className="text-xl font-semibold">Collection</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">
          Sign in to track cards you own. Browse the catalog from Search to add cards.
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
  const take = Number.isFinite(rawTake) && rawTake > 0 ? rawTake : INITIAL_TAKE;

  const [entries, itemConditions, wishlistEntryIdsByMasterCardId, facets] = await Promise.all([
    fetchCollectionCardEntries(customer.id),
    fetchItemConditionOptions(),
    fetchWishlistIdsByMasterCard(customer.id),
    getCachedFilterFacets(),
  ]);
  const collectionLinesByMasterCardId = groupCollectionLinesByGroupKey(entries);

  // Build grading label + image map per variant+condition+grade (not just master id)
  const gradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }> = {};
  for (const e of entries) {
    if (e.gradingCompany && e.gradeValue) {
      gradingByMasterCardId[collectionGroupKeyFromEntry(e)] = {
        company: e.gradingCompany,
        grade: e.gradeValue,
        imageUrl: e.gradedImageUrl,
      };
    }
  }
  const allCardsForGrid = mergeCollectionEntriesForGrid(entries);

  const setFilterOptions = await getCachedSetFilterOptions((facets ?? {}).setCodes ?? []);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );

  const [collectionValue, pricesResult] = await Promise.all([
    entries.length > 0 ? estimateCollectionMarketValueGbp(entries) : Promise.resolve(null),
    entries.length > 0 ? estimateCardUnitPricesGbp(entries) : Promise.resolve({ prices: {}, manualPriceIds: new Set<string>() }),
  ]);
  const cardPricesByMasterCardId = pricesResult.prices;
  const manualPriceMasterCardIds = pricesResult.manualPriceIds;

  const allCardsSortedByPrice =
    allCardsForGrid.length > 0
      ? sortCollectGridRowsByPriceDesc(allCardsForGrid, cardPricesByMasterCardId)
      : allCardsForGrid;
  const cardsForClient = allCardsSortedByPrice.slice(0, take);
  const totalCards = allCardsForGrid.length;

  const valueFormatted =
    collectionValue && collectionValue.totalGbp > 0
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
          collectionValue.totalGbp,
        )
      : null;

  const uniqueCatalogCards = allCardsForGrid.length;
  const totalCopies = totalCopiesFromMergedGrid(allCardsForGrid);
  const collectionCountLabel =
    totalCopies === 0
      ? null
      : uniqueCatalogCards === totalCopies
        ? `${totalCopies} card${totalCopies === 1 ? "" : "s"}`
        : `${totalCopies} card${totalCopies === 1 ? "" : "s"} (${uniqueCatalogCards} Unique)`;

  const showingCount = cardsForClient.length;
  const nextTake = Math.min(totalCards, showingCount + LOAD_MORE_STEP);
  const canLoadMore = showingCount > 0 && showingCount < totalCards;
  const loadMoreHref = `/collect?take=${encodeURIComponent(String(nextTake))}`;
  const scrollRestoreKey = [String(take), "collect"].join("|");

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex shrink-0 items-center px-4 pt-[var(--mobile-page-top-offset)]">
        <h1 className="text-xl font-semibold">My collection</h1>
      </div>
      {collectionCountLabel ? (
        <p className="mt-2 shrink-0 px-4 text-sm text-[var(--foreground)]/65">{collectionCountLabel}</p>
      ) : null}
      {valueFormatted ? (
        <p className="mt-1 shrink-0 px-4 text-base font-semibold tabular-nums text-[var(--foreground)]">
          {valueFormatted}
        </p>
      ) : null}
      {allCardsForGrid.length === 0 ? (
        <p className="mt-4 px-4 max-w-md text-sm text-[var(--foreground)]/70">
          Nothing here yet. Open Search, tap a card, then use + to add copies you own.
        </p>
      ) : (
        <div className="mt-6">
          <CardsResultsScroll
            canLoadMore={canLoadMore}
            loadMoreHref={loadMoreHref}
            loadMoreStep={LOAD_MORE_STEP}
            scrollRestoreKey={scrollRestoreKey}
            scrollsWindow
          >
            <div className="pb-4">
              <CollectCardGridWithTags
                cards={cardsForClient}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                variant="collection"
                itemConditions={itemConditions}
                wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
                collectionLinesByMasterCardId={collectionLinesByMasterCardId}
                cardPricesByMasterCardId={cardPricesByMasterCardId}
                manualPriceMasterCardIds={manualPriceMasterCardIds}
                gradingByMasterCardId={gradingByMasterCardId}
              />
            </div>
          </CardsResultsScroll>
        </div>
      )}
    </div>
  );
}
