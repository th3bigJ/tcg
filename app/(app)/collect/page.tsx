import Link from "next/link";

import { CollectCardGridWithTags } from "@/components/CollectCardGridWithTags";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { getCurrentCustomer } from "@/lib/auth";
import { getCachedFilterFacets } from "@/lib/cardsPageQueries";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { estimateCollectionMarketValueGbp, estimateCardUnitPricesGbp } from "@/lib/collectionMarketValueGbp";
import {
  collectionGroupKeyFromEntry,
  fetchItemConditionOptions,
  groupCollectionLinesByGroupKey,
  groupCollectionLinesByMasterCardId,
  mergeCollectionEntriesForGrid,
  totalCopiesFromMergedGrid,
} from "@/lib/storefrontCardMaps";
import { fetchCollectionCardEntries, fetchWishlistIdsByMasterCard } from "@/lib/storefrontCardMapsServer";
import { isGradedConditionId, isGradedConditionLabel } from "@/lib/referenceData";

type CollectPageProps = {
  searchParams?: Promise<{ group_by_set?: string }>;
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
  const groupBySet = resolvedSearchParams.group_by_set === "1";

  const [entries, itemConditions, wishlistEntryIdsByMasterCardId, facets] = await Promise.all([
    fetchCollectionCardEntries(customer.id),
    fetchItemConditionOptions(),
    fetchWishlistIdsByMasterCard(customer.id),
    getCachedFilterFacets(),
  ]);
  const collectionLinesByMasterCardId = {
    ...groupCollectionLinesByMasterCardId(entries),
    ...groupCollectionLinesByGroupKey(entries),
  };

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

  const [setFilterOptions, collectionValue, pricesResult] = await Promise.all([
    getCachedSetFilterOptions((facets ?? {}).setCodes ?? []),
    entries.length > 0 ? estimateCollectionMarketValueGbp(entries) : Promise.resolve(null),
    entries.length > 0 ? estimateCardUnitPricesGbp(entries) : Promise.resolve({ prices: {}, manualPriceIds: new Set<string>() }),
  ]);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );
  const cardPricesByMasterCardId: Record<string, number> = { ...pricesResult.prices };
  for (const [mid, lines] of Object.entries(collectionLinesByMasterCardId)) {
    if (mid.includes("|")) continue;
    let highest: number | null = null;
    for (const line of lines) {
      if ((line.gradingCompany?.trim() ?? "") && (line.gradeValue?.trim() ?? "")) continue;
      if (isGradedConditionId(line.conditionId)) continue;
      if (isGradedConditionLabel(line.conditionLabel)) continue;
      const groupKey = collectionGroupKeyFromEntry({
        masterCardId: mid,
        conditionLabel: line.conditionLabel,
        printing: line.printing,
        language: line.language,
        gradingCompany: line.gradingCompany,
        gradeValue: line.gradeValue,
      });
      const price = cardPricesByMasterCardId[groupKey];
      if (typeof price !== "number" || !Number.isFinite(price)) continue;
      highest = highest === null ? price : Math.max(highest, price);
    }
    if (highest !== null) cardPricesByMasterCardId[mid] = highest;
  }
  const manualPriceMasterCardIds = pricesResult.manualPriceIds;

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

  const scrollRestoreKey = ["collect", groupBySet ? "grouped" : "flat"].join("|");

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      {collectionCountLabel ? (
        <p className="mt-4 shrink-0 px-4 text-sm text-[var(--foreground)]/65">{collectionCountLabel}</p>
      ) : null}
      {valueFormatted ? (
        <p className="mt-1 shrink-0 px-4 text-base font-semibold tabular-nums text-[var(--foreground)]">
          {valueFormatted} <span className="text-sm font-normal text-[var(--foreground)]/55">Market value</span>
        </p>
      ) : null}
      {allCardsForGrid.length === 0 ? (
        <p className="mt-4 px-4 max-w-md text-sm text-[var(--foreground)]/70">
          Nothing here yet. Open Search, tap a card, then use + to add copies you own.
        </p>
      ) : (
        <div className="mt-6">
          <CardsResultsScroll
            canLoadMore={false}
            loadMoreHref="/collect"
            loadMoreStep={42}
            scrollRestoreKey={scrollRestoreKey}
            scrollsWindow
          >
            <div className="pb-4">
              <CollectCardGridWithTags
                cards={allCardsForGrid}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                variant="collection"
                routeGroupBySet={groupBySet}
                filterScope="collect"
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
