import { randomUUID } from "node:crypto";
import { ExpansionsList } from "@/components/ExpansionsList";
import { PokedexList } from "@/components/PokedexList";
import { SearchBrowseTabs } from "@/components/SearchBrowseTabs";
import { SearchCardGrid } from "@/components/SearchCardGrid";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { getCurrentCustomer } from "@/lib/auth";
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
import {
  getCachedExpansionSetRows,
  groupExpansionSetsBySeries,
} from "@/lib/expansionsPageQueries";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";

const TOTAL_POKEMON_COUNT = 1025;

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
    tab?: string;
    seed?: string;
  }>;
};

const searchShellClass =
  "flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:box-border lg:flex lg:h-[calc(100dvh-var(--bottom-nav-offset))] lg:max-h-[calc(100dvh-var(--bottom-nav-offset))] lg:min-h-0 lg:shrink-0";

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const tabRaw = (resolvedSearchParams.tab ?? "").trim().toLowerCase();
  const browseTab = tabRaw === "sets" ? "sets" : tabRaw === "pokedex" ? "pokedex" : "cards";

  const customer = await getCurrentCustomer();

  if (browseTab === "sets") {
    const [rows, collectionEntries] = await Promise.all([
      getCachedExpansionSetRows(),
      customer ? fetchCollectionCardEntries(customer.id) : Promise.resolve([]),
    ]);
    let uniqueOwnedBySetCode: Record<string, number> | null = null;
    const seenBySetCode = new Map<string, Set<string>>();

    if (customer) {
      uniqueOwnedBySetCode = {};
      for (const entry of collectionEntries) {
        const setCode = typeof entry.set === "string" ? entry.set.trim() : "";
        if (!setCode || setCode === "unknown") continue;
        const uniqueCardKey =
          entry.masterCardId ??
          [entry.set, entry.cardNumber, entry.filename].filter((v) => Boolean(v)).join("|");
        if (!uniqueCardKey) continue;
        const seen = seenBySetCode.get(setCode) ?? new Set<string>();
        seen.add(uniqueCardKey);
        seenBySetCode.set(setCode, seen);
      }

      for (const [setCode, seen] of seenBySetCode.entries()) {
        uniqueOwnedBySetCode[setCode] = seen.size;
      }
    }

    const groups = groupExpansionSetsBySeries(rows);

    return (
      <div className={searchShellClass}>
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-[var(--mobile-page-top-offset)] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <SearchBrowseTabs activeTab="sets" cardsHref="/search?tab=cards" />
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            <ExpansionsList groups={groups} uniqueOwnedBySetCode={uniqueOwnedBySetCode} />
          </div>
        </main>
      </div>
    );
  }

  if (browseTab === "pokedex") {
    const [pokemon, collectionEntries] = await Promise.all([
      getCachedPokemonFilterOptions(),
      customer ? fetchCollectionCardEntries(customer.id) : Promise.resolve([]),
    ]);
    const collectedDexIds = new Set<number>();

    for (const entry of collectionEntries) {
      const dexIds = Array.isArray(entry.dexIds) ? entry.dexIds : [];
      for (const dexId of dexIds) {
        if (!Number.isFinite(dexId) || dexId <= 0) continue;
        const normalized = Math.trunc(dexId);
        if (normalized >= 1 && normalized <= TOTAL_POKEMON_COUNT) {
          collectedDexIds.add(normalized);
        }
      }
    }
    const collectedPokemonCount = collectedDexIds.size;

    return (
      <div className={searchShellClass}>
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-[var(--mobile-page-top-offset)] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <SearchBrowseTabs activeTab="pokedex" cardsHref="/search?tab=cards" />
          <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1.5rem,var(--bottom-nav-offset))]">
            <h1 className="text-xl font-semibold tracking-tight">Pokédex</h1>
            {customer ? (
              <p className="mb-4 mt-1 text-sm text-[var(--foreground)]/70">
                {collectedPokemonCount} of {TOTAL_POKEMON_COUNT} Pokemon collected
              </p>
            ) : (
              <div className="mb-4" aria-hidden />
            )}
            <PokedexList
              pokemon={pokemon}
              collectedDexIds={collectedDexIds}
              customerLoggedIn={Boolean(customer)}
            />
          </div>
        </main>
      </div>
    );
  }

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

  const randomSeed =
    (resolvedSearchParams.seed ?? "").trim() || randomUUID().slice(0, 8);

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
    randomSeed,
  });

  const showingCount = cardsForGrid.length;
  const nextTake = Math.min(filteredCount, showingCount + CARDS_LOAD_MORE_STEP);
  const canLoadMore = showingCount > 0 && showingCount < filteredCount;

  const buildCardsHref = (take?: number) => {
    const params = new URLSearchParams();
    params.set("tab", "cards");
    params.set("seed", randomSeed);
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
    randomSeed,
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
    params.set("tab", "cards");
    params.set("seed", randomSeed);
    if (activeSet) params.set("set", activeSet);
    if (activePokemon) params.set("pokemon", activePokemon);
    if (activeSearch) params.set("search", activeSearch);
    const qs = params.toString();
    return `/search${qs ? `?${qs}` : ""}`;
  })();

  const cardsTabHref = buildCardsHref(requestedTake);

  return (
    <div className={searchShellClass}>
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-[var(--mobile-page-top-offset)] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <SearchBrowseTabs activeTab="cards" cardsHref={cardsTabHref} />
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
                extraHiddenFields={{ tab: "cards", seed: randomSeed }}
                activeSearch={activeSearch}
                activeSet={activeSet}
                activePokemon={activePokemon}
                activeRarity={activeRarity}
                activeCategory={activeCategory}
                excludeCommonUncommon={excludeCommonUncommon}
                rarityOptions={rarityOptions}
                categoryOptions={categoryOptions}
                resetHref={clearTagFiltersHref}
                defaultGroupBySet={false}
                showGroupBySetTag={false}
                defaultSortOrder="price-desc"
              />
            </CardsResultsScroll>
          </section>
        </div>
      </main>
    </div>
  );
}
