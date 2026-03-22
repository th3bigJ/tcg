import Link from "next/link";
import { CardGrid } from "@/components/CardGrid";
import { CardFiltersPanel } from "@/components/CardFiltersPanel";
import { CardsMobileControls } from "@/components/CardsMobileControls";
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
import {
  fetchCollectionCardEntries,
  fetchItemConditionOptions,
  fetchWishlistIdsByMasterCard,
  groupCollectionLinesByMasterCardId,
} from "@/lib/storefrontCardMaps";

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
    category?: string;
  }>;
};

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedSet = (resolvedSearchParams.set ?? "").trim();
  const selectedPokemon = (resolvedSearchParams.pokemon ?? "").trim();
  const selectedRarity = (resolvedSearchParams.rarity ?? "").trim();
  const selectedSearch = (resolvedSearchParams.search ?? "").trim();
  const excludeCommonUncommon = parseExcludeCommonUncommon(resolvedSearchParams.exclude_cu);
  const selectedCategory = (resolvedSearchParams.category ?? "").trim();
  const facets = (await getCachedFilterFacets()) ?? {};
  const availableSetCodes = facets.setCodes ?? [];
  const rarityOptions = facets.rarityDisplayValues ?? [];
  const categoryOptions = facets.categoryDisplayValues ?? [];
  const categoryMatchGroups = facets.categoryMatchGroups ?? {};
  const { canonicalLabel: activeCategory, queryVariants: categoryQueryVariants } =
    resolveCardsCategoryFilter(selectedCategory, categoryOptions, categoryMatchGroups);
  const setFilterOptions = await getCachedSetFilterOptions(availableSetCodes);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const pokemonFilterOptions = await getCachedPokemonFilterOptions();
  const hasSelectedSet = setFilterOptions.some((option) => option.code === selectedSet);
  const parsedPokemonDex = Number.parseInt(selectedPokemon, 10);
  const hasSelectedPokemon = Number.isFinite(parsedPokemonDex) && parsedPokemonDex > 0;
  const activePokemonOption = hasSelectedPokemon
    ? pokemonFilterOptions.find(
        (option) => option.nationalDexNumber === parsedPokemonDex,
      ) ?? null
    : null;
  const hasSelectedRarity = rarityOptions.includes(selectedRarity);
  const activeSet = hasSelectedSet ? selectedSet : "";
  const activePokemon = hasSelectedPokemon ? String(parsedPokemonDex) : "";
  const activePokemonDex = hasSelectedPokemon ? parsedPokemonDex : null;
  const activePokemonName = activePokemonOption?.name ?? null;
  const activeRarity = hasSelectedRarity ? selectedRarity : "";
  const activeSearch = selectedSearch;
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
    excludeCommonUncommon,
    categoryQueryVariants,
    page: 1,
    perPage: requestedTake,
  });

  /** Plain JSON so RSC → CardGrid keeps fields like dexIds (avoids odd Payload/proxy shapes). */
  const cardsForClient = JSON.parse(JSON.stringify(cardsForGrid)) as typeof cardsForGrid;

  const customer = await getCurrentCustomer();
  const itemConditions = customer ? await fetchItemConditionOptions() : [];
  const wishlistEntryIdsByMasterCardId = customer
    ? await fetchWishlistIdsByMasterCard(customer.id)
    : {};
  const collectionEntriesForModal = customer ? await fetchCollectionCardEntries(customer.id) : [];
  const collectionLinesByMasterCardId = groupCollectionLinesByMasterCardId(collectionEntriesForModal);

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
    if (activeSearch) params.set("search", activeSearch);
    if (excludeCommonUncommon) params.set("exclude_cu", "1");
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
    activeSearch,
    excludeCommonUncommon ? "1" : "",
    activeCategory,
  ].join("|");

  const resetFiltersHref = (() => {
    const params = new URLSearchParams();
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeSearch) params.set("search", activeSearch);
    if (excludeCommonUncommon) params.set("exclude_cu", "1");
    if (activeCategory) params.set("category", activeCategory);
    const query = params.toString();
    return query ? `/cards?${query}` : "/cards";
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <main className="min-h-0 w-full flex-1 overflow-hidden px-4 py-4">
        <div className="grid h-full min-h-0 items-stretch gap-4 lg:grid-cols-[20%_minmax(0,1fr)]">
          <aside className="hidden min-h-0 h-full flex-col rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-2 lg:flex">
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
            <CardFiltersPanel
              sets={setFilterOptions}
              pokemon={pokemonFilterOptions}
              rarityOptions={rarityOptions}
              categoryOptions={categoryOptions}
              activeSet={activeSet}
              activePokemonDex={activePokemon}
              activeRarity={activeRarity}
              activeSearch={activeSearch}
              excludeCommonUncommon={excludeCommonUncommon}
              activeCategory={activeCategory}
            />
          </aside>
          <section className="flex min-h-0 flex-col lg:pr-1">
            <CardsMobileControls
              activeSet={activeSet}
              activePokemon={activePokemon}
              activeRarity={activeRarity}
              activeSearch={activeSearch}
              rarityOptions={rarityOptions}
              categoryOptions={categoryOptions}
              excludeCommonUncommon={excludeCommonUncommon}
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
                {excludeCommonUncommon ? (
                  <input type="hidden" name="exclude_cu" value="1" />
                ) : null}
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
                activeSearch ||
                excludeCommonUncommon ||
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
              <CardGrid
                cards={cardsForClient}
                setLogosByCode={setLogosByCode}
                customerLoggedIn={Boolean(customer)}
                itemConditions={itemConditions}
                wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
                collectionLinesByMasterCardId={collectionLinesByMasterCardId}
              />
            </CardsResultsScroll>
          </section>
        </div>
      </main>
    </div>
  );
}
