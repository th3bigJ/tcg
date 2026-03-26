import Link from "next/link";
import config from "@payload-config";
import { getPayload } from "payload";

import { CardGrid } from "@/components/CardGrid";
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

export default async function WishlistPage() {
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

  const entries = await fetchWishlistCardEntries(customer.id);
  const cardsForClient = structuredClone(entries) as typeof entries;

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
      <p className="mt-2 text-sm text-[var(--foreground)]/65">
        {cardsForClient.length} card{cardsForClient.length === 1 ? "" : "s"}
      </p>
      {valueFormatted ? (
        <p className="mt-1 text-base font-semibold tabular-nums text-[var(--foreground)]">
          {valueFormatted}
        </p>
      ) : null}
      {cardsForClient.length === 0 ? (
        <p className="mt-4 max-w-md text-sm text-[var(--foreground)]/70">
          Save cards from Search with the heart button on the card preview.
        </p>
      ) : (
        <div className="mt-6 min-h-0 flex-1">
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
      )}
    </div>
  );
}
