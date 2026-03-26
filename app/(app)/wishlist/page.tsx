import Link from "next/link";
import config from "@payload-config";
import { getPayload } from "payload";

import { CardGrid } from "@/components/CardGrid";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { getCurrentCustomer } from "@/lib/auth";
import { getCachedFilterFacets } from "@/lib/cardsPageQueries";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { estimateCollectionMarketValueGbp, estimateCardUnitPricesGbp } from "@/lib/collectionMarketValueGbp";
import {
  fetchCollectionCardEntries,
  fetchItemConditionOptions,
  fetchWishlistCardEntries,
  fetchWishlistIdsByMasterCard,
  groupCollectionLinesByMasterCardId,
} from "@/lib/storefrontCardMaps";

const INITIAL_TAKE = 30;
const LOAD_MORE_STEP = 30;

type WishlistPageProps = {
  searchParams?: Promise<{ take?: string }>;
};

export default async function WishlistPage({ searchParams }: WishlistPageProps) {
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
        <div className="flex items-center gap-3">
          <Link
            href="/collect"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--foreground)]/10 transition hover:bg-[var(--foreground)]/18"
            aria-label="Back to collection"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold">Wishlist</h1>
        </div>
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
  const take = Number.isFinite(rawTake) && rawTake > 0 ? rawTake : INITIAL_TAKE;

  const entries = await fetchWishlistCardEntries(customer.id);
  const allCardsForGrid = structuredClone(entries) as typeof entries;

  const [
    collectionEntries,
    itemConditions,
    wishlistEntryIdsByMasterCardId,
    facets,
    payload,
  ] = await Promise.all([
    fetchCollectionCardEntries(customer.id),
    fetchItemConditionOptions(),
    fetchWishlistIdsByMasterCard(customer.id),
    getCachedFilterFacets().then((r) => r ?? {}),
    getPayload({ config }),
  ]);

  const collectionLinesByMasterCardId = groupCollectionLinesByMasterCardId(collectionEntries);
  const setFilterOptions = await getCachedSetFilterOptions(facets.setCodes ?? []);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );

  const [wishlistValue, cardPricesByMasterCardId] = await Promise.all([
    entries.length > 0 ? estimateCollectionMarketValueGbp(payload, entries) : Promise.resolve(null),
    entries.length > 0 ? estimateCardUnitPricesGbp(payload, entries) : Promise.resolve({}),
  ]);
  const valueFormatted =
    wishlistValue && wishlistValue.totalGbp > 0
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
          wishlistValue.totalGbp,
        )
      : null;

  const cardsForClient = allCardsForGrid.slice(0, take);
  const totalCards = allCardsForGrid.length;
  const showingCount = cardsForClient.length;
  const nextTake = Math.min(totalCards, showingCount + LOAD_MORE_STEP);
  const canLoadMore = showingCount > 0 && showingCount < totalCards;
  const loadMoreHref = `/wishlist?take=${encodeURIComponent(String(nextTake))}`;
  const scrollRestoreKey = [String(take), "wishlist"].join("|");

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex shrink-0 items-center gap-3 px-4 pt-[var(--mobile-page-top-offset)]">
        <Link
          href="/collect"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--foreground)]/10 transition hover:bg-[var(--foreground)]/18"
          aria-label="Back to collection"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold">Wishlist</h1>
      </div>
      <p className="mt-2 shrink-0 px-4 text-sm text-[var(--foreground)]/65">
        {allCardsForGrid.length} card{allCardsForGrid.length === 1 ? "" : "s"}
      </p>
      {valueFormatted ? (
        <p className="mt-1 shrink-0 px-4 text-base font-semibold tabular-nums text-[var(--foreground)]">
          {valueFormatted}
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
            loadMoreStep={LOAD_MORE_STEP}
            scrollRestoreKey={scrollRestoreKey}
            scrollsWindow
          >
            <div className="px-4 pb-4">
              <CardGrid
                cards={cardsForClient}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                variant="wishlist"
                customerLoggedIn
                itemConditions={itemConditions}
                wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
                collectionLinesByMasterCardId={collectionLinesByMasterCardId}
                cardPricesByMasterCardId={cardPricesByMasterCardId}
                groupBySet
              />
            </div>
          </CardsResultsScroll>
        </div>
      )}
    </div>
  );
}
