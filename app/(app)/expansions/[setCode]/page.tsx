import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpansionSetCardGrid } from "@/components/ExpansionSetCardGrid";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import {
  CARDS_TAKE_MAX,
  fetchMasterCardsPage,
  fetchSetCompletionValue,
  fetchSetMarketValue,
  getCachedFilterFacets,
  resolveCardsCategoryFilter,
} from "@/lib/cardsPageQueries";
import { getCurrentCustomer } from "@/lib/auth";
import { getSearchCardDataForCustomer } from "@/lib/searchCardDataServer";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";

type ExpansionSetCardsPageProps = {
  params: Promise<{ setCode: string }>;
  searchParams?: Promise<{
    search?: string;
    rarity?: string;
    exclude_cu?: string;
    exclude_owned?: string;
    category?: string;
    energy?: string;
  }>;
};

export default async function ExpansionSetCardsPage({
  params,
  searchParams,
}: ExpansionSetCardsPageProps) {
  const { setCode: rawSetCode } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeSet = decodeURIComponent(rawSetCode).trim();
  if (!activeSet) notFound();

  const setRows = await getCachedSetFilterOptions([activeSet]);
  if (setRows.length === 0) notFound();
  const setMeta = setRows[0];

  const facets = (await getCachedFilterFacets()) ?? {};
  const availableSetCodes = facets.setCodes ?? [];
  const rarityOptions = facets.rarityDisplayValues ?? [];
  const energyOptions = facets.energyTypeDisplayValues ?? [];
  const categoryOptions = facets.categoryDisplayValues ?? [];
  const categoryMatchGroups = facets.categoryMatchGroups ?? {};
  const setFilterOptions = await getCachedSetFilterOptions(availableSetCodes);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );

  const activeSearch = resolvedSearchParams.search?.trim() ?? "";
  const activeRarity = resolvedSearchParams.rarity?.trim() ?? "";
  const excludeCommonUncommon = resolvedSearchParams.exclude_cu === "1";
  const excludeOwned = resolvedSearchParams.exclude_owned === "1";
  const selectedCategory = resolvedSearchParams.category?.trim() ?? "";
  const { canonicalLabel: activeCategory, queryVariants: categoryQueryVariants } =
    resolveCardsCategoryFilter(selectedCategory, categoryOptions, categoryMatchGroups);

  const selectedEnergy = resolvedSearchParams.energy?.trim() ?? "";
  const activeEnergy = energyOptions.includes(selectedEnergy) ? selectedEnergy : "";

  const customer = await getCurrentCustomer();
  const collectionEntries = customer ? await fetchCollectionCardEntries(customer.id) : [];
  const ownedMasterCardIds = new Set(
    collectionEntries
      .map((entry) => entry.masterCardId?.trim() ?? "")
      .filter((value) => value.length > 0),
  );
  const [{ entries: cardsForGrid, totalDocs: filteredCount }, setMarketValue] =
    await Promise.all([
      fetchMasterCardsPage({
        activeSet,
        activePokemonDex: null,
        activePokemonName: null,
        activeRarity,
        activeEnergy,
        activeSearch,
        activeArtist: "",
        excludeCommonUncommon,
        excludedMasterCardIds: excludeOwned ? ownedMasterCardIds : undefined,
        categoryQueryVariants,
        page: 1,
        perPage: CARDS_TAKE_MAX,
      }),
      fetchSetMarketValue(activeSet),
    ]);
  const setCompletionValue =
    customer ? await fetchSetCompletionValue(activeSet, cardsForGrid, ownedMasterCardIds) : null;
  const initialSearchCardData = customer ? await getSearchCardDataForCustomer(customer.id) : null;

  const setPath = `/expansions/${encodeURIComponent(activeSet)}`;
  const scrollRestoreKey = [activeSet, "expansion-set"].join("|");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pt-2">
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="mb-0 flex shrink-0 items-center gap-2 border-b border-[var(--foreground)]/10 pb-2">
            <Link
              href="/search?tab=sets"
              prefetch={false}
              className="inline-flex h-9 min-w-[36px] shrink-0 items-center justify-center text-[var(--foreground)] transition hover:opacity-75 active:opacity-60"
              aria-label="Back to sets"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
            <span className="flex h-8 max-w-[4.5rem] shrink-0 items-center justify-center">
              <img
                src={setMeta.logoSrc}
                alt=""
                className="max-h-8 w-auto max-w-full object-contain object-center"
              />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-balance text-sm font-semibold leading-tight tracking-tight sm:text-base">
                {setMeta.name}
              </h1>
              <p className="text-xs text-[var(--foreground)]/60">
                {filteredCount} card{filteredCount === 1 ? "" : "s"}
                {setMarketValue != null && (
                  <> · <span className="text-[var(--foreground)]/80">£{setMarketValue.toFixed(2)} set market value</span></>
                )}
              </p>
              {setCompletionValue != null ? (
                <p className="text-xs text-[var(--foreground)]/80">
                  {setCompletionValue.missingCount} card{setCompletionValue.missingCount === 1 ? "" : "s"} needed
                  {" · "}£{setCompletionValue.totalValueGbp.toFixed(2)} value to complete
                </p>
              ) : null}
            </div>
          </header>

          <div className="mt-2 min-h-0 flex-1">
            <CardsResultsScroll
              canLoadMore={false}
              loadMoreHref=""
              loadMoreStep={0}
              scrollRestoreKey={scrollRestoreKey}
            >
              <ExpansionSetCardGrid
                cards={cardsForGrid}
                initialSearchCardData={initialSearchCardData}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                customerLoggedIn={Boolean(customer)}
                formAction={setPath}
                activeSearch={activeSearch}
                activeRarity={activeRarity}
                activeCategory={activeCategory}
                excludeCommonUncommon={excludeCommonUncommon}
                rarityOptions={rarityOptions}
                activeEnergy={activeEnergy}
                energyOptions={energyOptions}
                categoryOptions={categoryOptions}
              />
            </CardsResultsScroll>
          </div>
        </div>
      </main>
    </div>
  );
}
