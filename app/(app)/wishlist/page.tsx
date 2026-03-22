import Link from "next/link";
import config from "@payload-config";
import { getPayload } from "payload";

import { CardGrid } from "@/components/CardGrid";
import { getCurrentCustomer } from "@/lib/auth";
import { getCachedFilterFacets } from "@/lib/cardsPageQueries";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { estimateCollectionMarketValueGbp } from "@/lib/collectionMarketValueGbp";
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

  const wishlistValue =
    entries.length > 0 ? await estimateCollectionMarketValueGbp(payload, entries) : null;
  const valueFormatted =
    wishlistValue && wishlistValue.totalGbp > 0
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
          wishlistValue.totalGbp,
        )
      : null;

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
      <h1 className="text-xl font-semibold">Wishlist</h1>
      <p className="mt-1 text-sm text-[var(--foreground)]/65">
        {cardsForClient.length} card{cardsForClient.length === 1 ? "" : "s"}
      </p>
      {wishlistValue && entries.length > 0 ? (
        valueFormatted ? (
          <p className="mt-2 text-base font-semibold tabular-nums text-[var(--foreground)]">
            {valueFormatted}
            <span className="ml-2 text-sm font-normal text-[var(--foreground)]/60">
              estimated market value
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--foreground)]/60">
            Estimated market value isn&apos;t available for these cards yet.
          </p>
        )
      ) : null}
      {wishlistValue?.hasIncompleteData && valueFormatted ? (
        <p className="mt-1 max-w-md text-xs text-[var(--foreground)]/55">
          Partial estimate — guide prices for {wishlistValue.pricedCardCount} of{" "}
          {wishlistValue.attemptedCardCount} wishlist cards; some cards omitted.
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
            variant="wishlist"
            customerLoggedIn
            itemConditions={itemConditions}
            wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
            collectionLinesByMasterCardId={collectionLinesByMasterCardId}
          />
        </div>
      )}
    </div>
  );
}
