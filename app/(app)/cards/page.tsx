import Link from "next/link";
import { SearchCardGrid } from "@/components/SearchCardGrid";
import { CardFiltersPanel } from "@/components/CardFiltersPanel";
import { CardsMobileControls } from "@/components/CardsMobileControls";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import {
  CARDS_LOAD_MORE_STEP,
  fetchMasterCardsPage,
  generateShuffledSetOrder,
  getCachedFilterFacets,
  resolveCardsCategoryFilter,
  resolveCardsTakeFromParams,
} from "@/lib/cardsPageQueries";
import {
  getCachedPokemonFilterOptions,
  getCachedSetFilterOptions,
} from "@/lib/cardsFilterOptionsServer";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchPriceSummariesForMasterCardIds } from "@/lib/cardPricingBulk";
import { getSearchCardDataForCustomer } from "@/lib/searchCardDataServer";
import { getMasterCardIdsWithMinCopies } from "@/lib/storefrontCardMaps";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";

function parseExcludeCommonUncommon(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

type CardsPageProps = {
  searchParams?: Promise<{
    take?: string;
    page?: string;
    set?: string;
    pokemon?: string;
    rarity?: string;
    search?: string;
    exclude_cu?: string;
    exclude_owned?: string;
    duplicates_only?: string;
    category?: string;
    artist?: string;
    energy?: string;
  }>;
};

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedSet = (resolvedSearchParams.set ?? "").trim();
  const selectedPokemon = (resolvedSearchParams.pokemon ?? "").trim();
  const selectedRarity = (resolvedSearchParams.rarity ?? "").trim();
  const selectedSearch = (resolvedSearchParams.search ?? "").trim();
  const excludeCommonUncommon = parseExcludeCommonUncommon(resolvedSearchParams.exclude_cu);
  const excludeOwned = parseExcludeCommonUncommon(resolvedSearchParams.exclude_owned);
  const duplicatesOnly = parseExcludeCommonUncommon(resolvedSearchParams.duplicates_only);
  const selectedCategory = (resolvedSearchParams.category ?? "").trim();
  const activeArtist = (resolvedSearchParams.artist ?? "").trim();
  const facets = (await getCachedFilterFacets()) ?? {};
  const availableSetCodes = facets.setCodes ?? [];
  const rarityOptions = facets.rarityDisplayValues ?? [];
  const energyOptions = facets.energyTypeDisplayValues ?? [];
  const categoryOptions = facets.categoryDisplayValues ?? [];
  const categoryMatchGroups = facets.categoryMatchGroups ?? {};
  const { canonicalLabel: activeCategory, queryVariants: categoryQueryVariants } =
    resolveCardsCategoryFilter(selectedCategory, categoryOptions, categoryMatchGroups);
  const [setFilterOptions, pokemonFilterOptions] = await Promise.all([
    getCachedSetFilterOptions(availableSetCodes),
    getCachedPokemonFilterOptions(),
  ]);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );
  const hasSelectedSet = setFilterOptions.some((option) => option.code === selectedSet);
  const parsedPokemonDex = Number.parseInt(selectedPokemon, 10);
  const hasSelectedPokemon = Number.isFinite(parsedPokemonDex) && parsedPokemonDex > 0;
  const activePokemonOption = hasSelectedPokemon
    ? pokemonFilterOptions.find(
        (option) => option.nationalDexNumber === parsedPokemonDex,
      ) ?? null
    : null;
  const hasSelectedRarity = rarityOptions.includes(selectedRarity);
  const selectedEnergy = (resolvedSearchParams.energy ?? "").trim();
  const hasSelectedEnergy = energyOptions.includes(selectedEnergy);
  const activeSet = hasSelectedSet ? selectedSet : "";
  const activePokemon = hasSelectedPokemon ? String(parsedPokemonDex) : "";
  const activePokemonDex = hasSelectedPokemon ? parsedPokemonDex : null;
  const activePokemonName = activePokemonOption?.name ?? null;
  const activeRarity = hasSelectedRarity ? selectedRarity : "";
  const activeEnergy = hasSelectedEnergy ? selectedEnergy : "";
  const activeSearch = selectedSearch;

  const requestedTake = resolveCardsTakeFromParams(
    resolvedSearchParams.take,
    resolvedSearchParams.page,
  );

  const setOrder = generateShuffledSetOrder();

  const customer = await getCurrentCustomer();
  const collectionEntries =
    customer && (excludeOwned || duplicatesOnly) ? await fetchCollectionCardEntries(customer.id) : [];
  const excludedMasterCardIds = new Set(
    collectionEntries.map((entry) => entry.masterCardId?.trim() ?? "").filter((value) => value.length > 0),
  );
  const duplicateOwnedMasterCardIds = getMasterCardIdsWithMinCopies(collectionEntries, 2);
  const { entries: cardsForGrid, totalDocs: filteredCount } = await fetchMasterCardsPage({
    activeSet,
    activePokemonDex,
    activePokemonName,
    activeRarity,
    activeEnergy,
    activeSearch,
    activeArtist,
    excludeCommonUncommon,
    excludedMasterCardIds: excludeOwned ? excludedMasterCardIds : undefined,
    includedMasterCardIds: duplicatesOnly ? duplicateOwnedMasterCardIds : undefined,
    categoryQueryVariants,
    page: 1,
    perPage: requestedTake,
    setOrder,
  });
  const initialSearchCardData = customer ? await getSearchCardDataForCustomer(customer.id) : null;

  const initialCardPriceIds = cardsForGrid
    .slice(0, 105)
    .map((c) => c.masterCardId)
    .filter((id): id is string => Boolean(id));
  const initialCardSummary = initialCardPriceIds.length > 0
    ? await fetchPriceSummariesForMasterCardIds(initialCardPriceIds)
    : { prices: {}, trends: {} };

  const cardsForClient = cardsForGrid;

  const showingCount = cardsForClient.length;
  const showingFrom = filteredCount === 0 ? 0 : 1;
  const showingTo = showingCount;
  const nextTake = Math.min(filteredCount, showingCount + CARDS_LOAD_MORE_STEP);
  const canLoadMore = showingCount > 0 && showingCount < filteredCount;

  const buildCardsHref = (take?: number) => {
    const params = new URLSearchParams();
    if (activeSet) params.set("set", activeSet);
    if (activePokemon) params.set("pokemon", activePokemon);
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeEnergy) params.set("energy", activeEnergy);
    if (activeSearch) params.set("search", activeSearch);
    if (activeArtist) params.set("artist", activeArtist);
    if (excludeCommonUncommon) params.set("exclude_cu", "1");
    if (excludeOwned) params.set("exclude_owned", "1");
    if (duplicatesOnly) params.set("duplicates_only", "1");
    if (activeCategory) params.set("category", activeCategory);
    if (take !== undefined && take > 0) params.set("take", String(take));
    const query = params.toString();
    return query ? `/cards?${query}` : "/cards";
  };
  const loadMoreHref = buildCardsHref(nextTake);
  const scrollRestoreKey = [
    String(requestedTake),
    activeSet,
    activePokemon,
    activeRarity,
    activeEnergy,
    activeSearch,
    activeArtist,
    excludeCommonUncommon ? "1" : "",
    excludeOwned ? "1" : "",
    duplicatesOnly ? "1" : "",
    activeCategory,
  ].join("|");

  const resetFiltersHref = (() => {
    const params = new URLSearchParams();
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeEnergy) params.set("energy", activeEnergy);
    if (activeSearch) params.set("search", activeSearch);
    if (excludeCommonUncommon) params.set("exclude_cu", "1");
    if (excludeOwned) params.set("exclude_owned", "1");
    if (duplicatesOnly) params.set("duplicates_only", "1");
    if (activeCategory) params.set("category", activeCategory);
    const query = params.toString();
    return query ? `/cards?${query}` : "/cards";
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:box-border lg:flex lg:h-[calc(100dvh-var(--bottom-nav-offset))] lg:max-h-[calc(100dvh-var(--bottom-nav-offset))] lg:min-h-0 lg:shrink-0">
      <main className="min-h-0 w-full flex-1 overflow-hidden px-4 pb-4 pt-[var(--mobile-page-top-offset)] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div className="grid h-full min-h-0 items-stretch gap-4 lg:grid-cols-[20%_minmax(0,1fr)] lg:flex-1 lg:min-h-0 lg:overflow-hidden">
          <aside className="hidden min-h-0 h-full flex-col overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-2 lg:flex lg:min-h-0">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Filters</h2>
              {activeSet || activePokemon ? (
                <Link
                  href={resetFiltersHref}
                  prefetch={false}
                  className="inline-flex rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-2 py-1 text-xs font-medium transition hover:bg-[var(--foreground)]/18"
                >
                  Clear
                </Link>
              ) : null}
            </div>
            <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto lg:min-h-0">
              <CardFiltersPanel
                sets={setFilterOptions}
                pokemon={pokemonFilterOptions}
                rarityOptions={rarityOptions}
                energyOptions={energyOptions}
                categoryOptions={categoryOptions}
                activeSet={activeSet}
                activePokemonDex={activePokemon}
                activeRarity={activeRarity}
                activeEnergy={activeEnergy}
                activeSearch={activeSearch}
                excludeCommonUncommon={excludeCommonUncommon}
                excludeOwned={excludeOwned}
                activeCategory={activeCategory}
              />
            </div>
          </aside>
          <section className="flex min-h-0 flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:pr-1">
            <CardsMobileControls
              activeSet={activeSet}
              activePokemon={activePokemon}
              activeRarity={activeRarity}
              activeEnergy={activeEnergy}
              activeSearch={activeSearch}
              rarityOptions={rarityOptions}
              energyOptions={energyOptions}
              categoryOptions={categoryOptions}
              excludeCommonUncommon={excludeCommonUncommon}
              excludeOwned={excludeOwned}
              duplicatesOnly={duplicatesOnly}
              activeCategory={activeCategory}
              resetFiltersHref={resetFiltersHref}
              setFilterOptions={setFilterOptions}
              pokemonFilterOptions={pokemonFilterOptions}
            />
            <div className="mb-4 hidden shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex">
              <form method="get" action="/cards" className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {activeSet ? <input type="hidden" name="set" value={activeSet} /> : null}
                {activePokemon ? <input type="hidden" name="pokemon" value={activePokemon} /> : null}
                {activeRarity ? <input type="hidden" name="rarity" value={activeRarity} /> : null}
                {activeEnergy ? <input type="hidden" name="energy" value={activeEnergy} /> : null}
                {excludeCommonUncommon ? (
                  <input type="hidden" name="exclude_cu" value="1" />
                ) : null}
                {excludeOwned ? <input type="hidden" name="exclude_owned" value="1" /> : null}
                {duplicatesOnly ? <input type="hidden" name="duplicates_only" value="1" /> : null}
                {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
                <input
                  type="search"
                  name="search"
                  defaultValue={activeSearch}
                  placeholder="Search card name"
                  aria-label="Search card name"
                  className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-1.5 text-xs shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_8px_20px_rgba(0,0,0,0.18)] outline-none transition focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/20 sm:w-72"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--foreground)]/20"
                >
                  Search
                </button>
                <Link
                  href="/cards"
                  prefetch={false}
                  className="inline-flex items-center justify-center rounded-md border border-red-400/50 bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/25 hover:text-red-200"
                >
                  Reset
                </Link>
              </form>
              <p className="text-right text-sm text-[var(--foreground)]/70">
                Showing {showingFrom}-{showingTo} of {filteredCount} card
                {filteredCount === 1 ? "" : "s"} in {setFilterOptions.length} set
                {setFilterOptions.length === 1 ? "" : "s"}
                {activeSet ||
                activePokemon ||
                activeRarity ||
                activeEnergy ||
                activeSearch ||
                excludeCommonUncommon ||
                excludeOwned ||
                duplicatesOnly ||
                activeCategory
                  ? " (filtered)"
                  : ""}
              </p>
            </div>
            <CardsResultsScroll
              canLoadMore={canLoadMore}
              loadMoreHref={loadMoreHref}
              loadMoreStep={CARDS_LOAD_MORE_STEP}
              scrollRestoreKey={scrollRestoreKey}
            >
              <SearchCardGrid
                cards={cardsForClient}
                initialCardPrices={initialCardSummary.prices}
                initialCardTrends={initialCardSummary.trends}
                initialSearchCardData={initialSearchCardData}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                customerLoggedIn={Boolean(customer)}
                formAction="/cards"
                activeSearch={activeSearch}
                activeSet={activeSet}
                activePokemon={activePokemon}
                activeRarity={activeRarity}
                activeEnergy={activeEnergy}
                activeCategory={activeCategory}
                excludeCommonUncommon={excludeCommonUncommon}
                excludeOwned={excludeOwned}
                duplicatesOnly={duplicatesOnly}
                rarityOptions={rarityOptions}
                energyOptions={energyOptions}
                categoryOptions={categoryOptions}
                resetHref={resetFiltersHref}
              />
            </CardsResultsScroll>
          </section>
        </div>
      </main>
    </div>
  );
}
