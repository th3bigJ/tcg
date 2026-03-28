import { SearchCardGrid } from "@/components/SearchCardGrid";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import {
  CARDS_LOAD_MORE_STEP,
  fetchMasterCardsPage,
  getCachedFilterFacets,
  resolveCardsCategoryFilter,
  resolveCardsTakeFromParams,
} from "@/lib/cardsPageQueries";
import {
  getCachedPokemonFilterOptions,
  getCachedSetFilterOptions,
} from "@/lib/cardsFilterOptionsServer";
import { getCurrentCustomer } from "@/lib/auth";

function parseExcludeCommonUncommon(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

type SearchPageProps = {
  searchParams?: Promise<{
    take?: string;
    page?: string;
    set?: string;
    pokemon?: string;
    rarity?: string;
    search?: string;
    exclude_cu?: string;
    category?: string;
    artist?: string;
  }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};

  const customer = await getCurrentCustomer();

  const selectedSet = (resolvedSearchParams.set ?? "").trim();
  const selectedPokemon = (resolvedSearchParams.pokemon ?? "").trim();
  const selectedRarity = (resolvedSearchParams.rarity ?? "").trim();
  const selectedSearch = (resolvedSearchParams.search ?? "").trim();
  const excludeCommonUncommon = parseExcludeCommonUncommon(resolvedSearchParams.exclude_cu);
  const selectedCategory = (resolvedSearchParams.category ?? "").trim();
  const selectedArtist = (resolvedSearchParams.artist ?? "").trim();

  const facets = (await getCachedFilterFacets()) ?? {};
  const availableSetCodes = facets.setCodes ?? [];
  const rarityOptions = facets.rarityDisplayValues ?? [];
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
    ? pokemonFilterOptions.find((option) => option.nationalDexNumber === parsedPokemonDex) ?? null
    : null;
  const hasSelectedRarity = rarityOptions.includes(selectedRarity);
  const activeSet = hasSelectedSet ? selectedSet : "";
  const activePokemon = hasSelectedPokemon ? String(parsedPokemonDex) : "";
  const activePokemonDex = hasSelectedPokemon ? parsedPokemonDex : null;
  const activePokemonName = activePokemonOption?.name ?? null;
  const activeRarity = hasSelectedRarity ? selectedRarity : "";
  const activeSearch = selectedSearch;
  const activeArtist = selectedArtist;
  const requestedTake = resolveCardsTakeFromParams(
    resolvedSearchParams.take,
    resolvedSearchParams.page,
  );

  const { entries: cardsForGrid, totalDocs: filteredCount } = await fetchMasterCardsPage({
    activeSet,
    activePokemonDex,
    activePokemonName,
    activeRarity,
    activeSearch,
    activeArtist,
    excludeCommonUncommon,
    categoryQueryVariants,
    page: 1,
    perPage: requestedTake,
  });

  const showingCount = cardsForGrid.length;
  const nextTake = Math.min(filteredCount, showingCount + CARDS_LOAD_MORE_STEP);
  const canLoadMore = showingCount > 0 && showingCount < filteredCount;

  const buildCardsHref = (take?: number) => {
    const params = new URLSearchParams();
    if (activeSet) params.set("set", activeSet);
    if (activePokemon) params.set("pokemon", activePokemon);
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeSearch) params.set("search", activeSearch);
    if (activeArtist) params.set("artist", activeArtist);
    if (excludeCommonUncommon) params.set("exclude_cu", "1");
    if (activeCategory) params.set("category", activeCategory);
    if (take !== undefined && take > 0) params.set("take", String(take));
    const qs = params.toString();
    return `/search${qs ? `?${qs}` : ""}`;
  };

  const loadMoreHref = buildCardsHref(nextTake);
  const scrollRestoreKey = [
    String(requestedTake),
    activeSet,
    activePokemon,
    activeRarity,
    activeSearch,
    activeArtist,
    excludeCommonUncommon ? "1" : "",
    activeCategory,
  ].join("|");

  const clearTagFiltersHref = (() => {
    const params = new URLSearchParams();
    if (activeSet) params.set("set", activeSet);
    if (activePokemon) params.set("pokemon", activePokemon);
    if (activeSearch) params.set("search", activeSearch);
    const qs = params.toString();
    return `/search${qs ? `?${qs}` : ""}`;
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:box-border lg:flex lg:h-[calc(100dvh-var(--bottom-nav-offset))] lg:max-h-[calc(100dvh-var(--bottom-nav-offset))] lg:min-h-0 lg:shrink-0">
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden lg:pr-1">
            <CardsResultsScroll
              canLoadMore={canLoadMore}
              loadMoreHref={loadMoreHref}
              loadMoreStep={CARDS_LOAD_MORE_STEP}
              scrollRestoreKey={scrollRestoreKey}
            >
              <SearchCardGrid
                cards={cardsForGrid}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                customerLoggedIn={Boolean(customer)}
                formAction="/search"
                activeSearch={activeSearch}
                activeSet={activeSet}
                activePokemon={activePokemon}
                activeRarity={activeRarity}
                activeCategory={activeCategory}
                excludeCommonUncommon={excludeCommonUncommon}
                rarityOptions={rarityOptions}
                categoryOptions={categoryOptions}
                resetHref={clearTagFiltersHref}
              />
            </CardsResultsScroll>
          </section>
        </div>
      </main>
    </div>
  );
}
