import Link from "next/link";
import config from "@payload-config";
import { getPayload } from "payload";

import { CardGrid } from "@/components/CardGrid";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { getCurrentCustomer } from "@/lib/auth";
import { getCachedFilterFacets } from "@/lib/cardsPageQueries";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { estimateCollectionMarketValueGbp } from "@/lib/collectionMarketValueGbp";
import {
  fetchCollectionCardEntries,
  fetchItemConditionOptions,
  fetchWishlistIdsByMasterCard,
  groupCollectionLinesByMasterCardId,
  mergeCollectionEntriesForGrid,
} from "@/lib/storefrontCardMaps";

const INITIAL_TAKE = 30;
const LOAD_MORE_STEP = 30;

type CollectionPageProps = {
  searchParams?: Promise<{ take?: string }>;
};

export default async function CollectionPage({ searchParams }: CollectionPageProps) {
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
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
  const collectionLinesByMasterCardId = groupCollectionLinesByMasterCardId(entries);
  const allCardsForGrid = mergeCollectionEntriesForGrid(entries);
  const cardsForClient = allCardsForGrid.slice(0, take);
  const totalCards = allCardsForGrid.length;

  const setFilterOptions = await getCachedSetFilterOptions((facets ?? {}).setCodes ?? []);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );

  const payload = await getPayload({ config });
  const collectionValue =
    entries.length > 0 ? await estimateCollectionMarketValueGbp(payload, entries) : null;
  const valueFormatted =
    collectionValue && collectionValue.totalGbp > 0
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
          collectionValue.totalGbp,
        )
      : null;

  const totalCopies = entries.reduce((sum, e) => {
    const q =
      typeof e.quantity === "number" && Number.isFinite(e.quantity) && e.quantity >= 1
        ? Math.floor(e.quantity)
        : 1;
    return sum + q;
  }, 0);
  const uniqueCatalogCards = allCardsForGrid.length;
  const collectionCountLabel =
    totalCopies === 0
      ? null
      : uniqueCatalogCards === totalCopies
        ? `${totalCopies} card${totalCopies === 1 ? "" : "s"}`
        : `${totalCopies} card${totalCopies === 1 ? "" : "s"} (${uniqueCatalogCards} Unique)`;

  const showingCount = cardsForClient.length;
  const nextTake = Math.min(totalCards, showingCount + LOAD_MORE_STEP);
  const canLoadMore = showingCount > 0 && showingCount < totalCards;
  const loadMoreHref = `/?take=${encodeURIComponent(String(nextTake))}`;
  const scrollRestoreKey = [String(take), "home-collection"].join("|");

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <h1 className="shrink-0 px-4 pt-[var(--mobile-page-top-offset)] text-xl font-semibold">
        My collection
      </h1>
      {collectionValue && entries.length > 0 ? (
        valueFormatted ? (
          <p className="mt-2 shrink-0 px-4 text-base font-semibold tabular-nums text-[var(--foreground)]">
            {valueFormatted}
            <span className="ml-2 text-sm font-normal text-[var(--foreground)]/60">
              estimated market value
            </span>
          </p>
        ) : (
          <p className="mt-2 shrink-0 px-4 text-sm text-[var(--foreground)]/60">
            Estimated market value isn&apos;t available for these cards yet.
          </p>
        )
      ) : null}
      {collectionValue?.hasIncompleteData && valueFormatted ? (
        <p className="mt-1 shrink-0 max-w-md px-4 text-xs text-[var(--foreground)]/55">
          Partial estimate — TCGPlayer-based guide prices from TCGdex for{" "}
          {collectionValue.pricedCardCount} of {collectionValue.attemptedCardCount} catalog cards;
          some copies omitted.
        </p>
      ) : null}
      {collectionCountLabel ? (
        <p className="mt-1 shrink-0 px-4 text-sm text-[var(--foreground)]/65">{collectionCountLabel}</p>
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
            <div className="px-4 pb-4">
              <CardGrid
                cards={cardsForClient}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                variant="collection"
                customerLoggedIn
                itemConditions={itemConditions}
                wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
                collectionLinesByMasterCardId={collectionLinesByMasterCardId}
                groupBySet
              />
            </div>
          </CardsResultsScroll>
        </div>
      )}
    </div>
  );
}
