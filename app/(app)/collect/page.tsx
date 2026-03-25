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
  fetchWishlistIdsByMasterCard,
  groupCollectionLinesByMasterCardId,
  mergeCollectionEntriesForGrid,
} from "@/lib/storefrontCardMaps";

export default async function CollectPage() {
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

  const [entries, itemConditions, wishlistEntryIdsByMasterCardId, facets] = await Promise.all([
    fetchCollectionCardEntries(customer.id),
    fetchItemConditionOptions(),
    fetchWishlistIdsByMasterCard(customer.id),
    getCachedFilterFacets(),
  ]);
  const collectionLinesByMasterCardId = groupCollectionLinesByMasterCardId(entries);
  const cardsForClient = mergeCollectionEntriesForGrid(entries);
  const setFilterOptions = await getCachedSetFilterOptions((facets ?? {}).setCodes ?? []);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );

  const payload = await getPayload({ config });
  const [collectionValue, cardPricesByMasterCardId] = await Promise.all([
    entries.length > 0 ? estimateCollectionMarketValueGbp(payload, entries) : Promise.resolve(null),
    entries.length > 0 ? estimateCardUnitPricesGbp(payload, entries) : Promise.resolve({}),
  ]);
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
  const uniqueCatalogCards = cardsForClient.length;
  const collectionCountLabel =
    totalCopies === 0
      ? null
      : uniqueCatalogCards === totalCopies
        ? `${totalCopies} card${totalCopies === 1 ? "" : "s"}`
        : `${totalCopies} card${totalCopies === 1 ? "" : "s"} (${uniqueCatalogCards} Unique)`;

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My collection</h1>
        <Link
          href="/wishlist"
          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700"
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
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
          </svg>
          Wishlist
        </Link>
      </div>
      {collectionCountLabel ? (
        <p className="mt-2 text-sm text-[var(--foreground)]/65">{collectionCountLabel}</p>
      ) : null}
      {valueFormatted ? (
        <p className="mt-1 text-base font-semibold tabular-nums text-[var(--foreground)]">
          {valueFormatted}
        </p>
      ) : null}
      {cardsForClient.length === 0 ? (
        <p className="mt-4 max-w-md text-sm text-[var(--foreground)]/70">
          Nothing here yet. Open Search, tap a card, then use + to add copies you own.
        </p>
      ) : (
        <div className="mt-6 min-h-0 flex-1">
          <CardGrid
            cards={cardsForClient}
            setLogosByCode={setLogosByCode}
            setSymbolsByCode={setSymbolsByCode}
            variant="collection"
            customerLoggedIn
            itemConditions={itemConditions}
            wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
            collectionLinesByMasterCardId={collectionLinesByMasterCardId}
            cardPricesByMasterCardId={cardPricesByMasterCardId}
          />
        </div>
      )}
    </div>
  );
}
