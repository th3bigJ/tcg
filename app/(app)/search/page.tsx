import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppLoadingScreen } from "@/app/(app)/AppLoadingScreen";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { SealedBrowseContent } from "@/components/SealedBrowseContent";
import { SearchCardsTabGridClient } from "@/components/SearchCardsTabGridClient";
import { getCurrentCustomer } from "@/lib/auth";
import {
  getCachedPokemonFilterOptions,
  getCachedSetFilterOptions,
} from "@/lib/cardsFilterOptionsServer";
import {
  CARDS_TAKE_MAX,
  CARDS_LOAD_MORE_STEP,
  fetchCardsMarketValue,
  fetchMasterCardsPage,
  fetchSetCompletionValue,
  fetchSetMarketValue,
  getCachedFilterFacets,
  resolveCardsCategoryFilter,
} from "@/lib/cardsPageQueries";
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";
import { getSearchCardDataForCustomer } from "@/lib/searchCardDataServer";
import { getMasterCardIdsWithMinCopies } from "@/lib/storefrontCardMaps";
import { normalizeSetCodeFromUrlParam } from "@/lib/staticCards";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";
import { type SortOrder, DEFAULT_SORT, SEARCH_DEFAULT_SORT } from "@/lib/persistedFilters";

const SEARCH_CARDS_INITIAL_TAKE = 105;

function parseExcludeCommonUncommon(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function parseSortOrder(value: string | undefined): SortOrder {
  switch ((value ?? "").trim()) {
    case "random":
    case "price-desc":
    case "price-asc":
    case "change-desc":
    case "change-asc":
    case "release-desc":
    case "release-asc":
    case "number-desc":
    case "number-asc":
      return value as SortOrder;
    default:
      return DEFAULT_SORT;
  }
}

type SearchPageProps = {
  searchParams?: Promise<{
    tab?: string;
    take?: string;
    page?: string;
    set?: string;
    pokemon?: string;
    rarity?: string;
    sort?: string;
    search?: string;
    exclude_cu?: string;
    exclude_owned?: string;
    owned_only?: string;
    category?: string;
    artist?: string;
    energy?: string;
    seed?: string;
    missing_only?: string;
    duplicates_only?: string;
    open_card?: string;
  }>;
};

const searchShellClass =
  "flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:box-border lg:flex lg:h-[calc(100dvh-var(--bottom-nav-offset))] lg:max-h-[calc(100dvh-var(--bottom-nav-offset))] lg:min-h-0 lg:shrink-0";

function SearchPageFallback() {
  return (
    <div className={searchShellClass}>
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <AppLoadingScreen label="Loading search" />
      </main>
    </div>
  );
}

export default function SearchPage({ searchParams }: SearchPageProps) {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <SearchPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SearchPageContent({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeTab = (resolvedSearchParams.tab ?? "cards").trim() || "cards";

  if (activeTab === "sealed") {
    return (
      <div className={searchShellClass}>
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden lg:pr-1">
              <SealedBrowseContent params={resolvedSearchParams} basePath="/search" tab="sealed" showFilterRow={false} />
            </section>
          </div>
        </main>
      </div>
    );
  }

  const selectedSet = normalizeSetCodeFromUrlParam(resolvedSearchParams.set ?? "");
  const selectedPokemon = (resolvedSearchParams.pokemon ?? "").trim();
  const selectedSort = parseSortOrder(resolvedSearchParams.sort);
  const selectedRarity = (resolvedSearchParams.rarity ?? "").trim();
  const selectedSearch = (resolvedSearchParams.search ?? "").trim();
  const excludeCommonUncommon = parseExcludeCommonUncommon(resolvedSearchParams.exclude_cu);
  const excludeOwned = resolvedSearchParams.exclude_owned === "1";
  const ownedOnly = resolvedSearchParams.owned_only === "1";
  const duplicatesOnly = resolvedSearchParams.duplicates_only === "1";
  const selectedCategory = (resolvedSearchParams.category ?? "").trim();
  const selectedArtist = (resolvedSearchParams.artist ?? "").trim();
  const selectedEnergy = (resolvedSearchParams.energy ?? "").trim();
  const incomingSeed = (resolvedSearchParams.seed ?? "").trim();
  const initialOpenCardMasterCardId = (resolvedSearchParams.open_card ?? "").trim();

  const isDefaultBrowseRequest =
    activeTab === "cards" &&
    !selectedSet &&
    !selectedPokemon &&
    !selectedRarity &&
    !selectedSearch &&
    !excludeCommonUncommon &&
    !excludeOwned &&
    !ownedOnly &&
    !duplicatesOnly &&
    !selectedCategory &&
    !selectedArtist &&
    !selectedEnergy;
  const effectiveSort =
    isDefaultBrowseRequest && !resolvedSearchParams.sort ? SEARCH_DEFAULT_SORT : selectedSort;

  if (!resolvedSearchParams.sort && isDefaultBrowseRequest) {
    const redirectParams = new URLSearchParams(
      Object.entries(resolvedSearchParams).filter(([, value]) => typeof value === "string" && value.length > 0),
    );
    redirectParams.set("seed", randomUUID().slice(0, 8));
    redirectParams.set("sort", SEARCH_DEFAULT_SORT);
    redirect(`/search?${redirectParams.toString()}`);
  }

  const customer = await getCurrentCustomer();
  const [facets, pokemonFilterOptions] = await Promise.all([
    getCachedFilterFacets(),
    getCachedPokemonFilterOptions(),
  ]);
  const resolvedFacets = facets ?? {};
  const availableSetCodes = resolvedFacets.setCodes ?? [];
  const rarityOptions = resolvedFacets.rarityDisplayValues ?? [];
  const energyOptions = resolvedFacets.energyTypeDisplayValues ?? [];
  const categoryOptions = resolvedFacets.categoryDisplayValues ?? [];
  const categoryMatchGroups = resolvedFacets.categoryMatchGroups ?? {};

  const [setFilterOptions, collectionEntries] = await Promise.all([
    getCachedSetFilterOptions(availableSetCodes),
    customer ? fetchCollectionCardEntries(customer.id) : Promise.resolve([]),
  ]);

  const { canonicalLabel: activeCategory, queryVariants: categoryQueryVariants } =
    resolveCardsCategoryFilter(selectedCategory, categoryOptions, categoryMatchGroups);
  const excludedMasterCardIds = new Set(
    (excludeOwned ? collectionEntries : [])
      .map((entry) => entry.masterCardId?.trim() ?? "")
      .filter((value) => value.length > 0),
  );

  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );

  const randomSeed = incomingSeed || randomUUID().slice(0, 8);
  const hasSelectedSet = setFilterOptions.some((option) => option.code === selectedSet);
  const parsedPokemonDex = Number.parseInt(selectedPokemon, 10);
  const activePokemonOption =
    Number.isFinite(parsedPokemonDex) && parsedPokemonDex > 0
      ? pokemonFilterOptions.find((option) => option.nationalDexNumber === parsedPokemonDex) ?? null
      : null;
  const hasSelectedPokemon = Boolean(activePokemonOption);
  const hasSelectedRarity = rarityOptions.includes(selectedRarity);
  const hasSelectedEnergy = energyOptions.includes(selectedEnergy);

  const activeSet = hasSelectedSet ? selectedSet : "";
  const activePokemon = hasSelectedPokemon ? String(activePokemonOption!.nationalDexNumber) : "";
  const activePokemonDex = hasSelectedPokemon ? activePokemonOption!.nationalDexNumber : null;
  const activePokemonName = activePokemonOption?.name ?? null;
  const activeRarity = hasSelectedRarity ? selectedRarity : "";
  const activeEnergy = hasSelectedEnergy ? selectedEnergy : "";
  const activeSearch = selectedSearch;
  const activeArtist = selectedArtist;
  const setMeta = activeSet
    ? setFilterOptions.find((option) => option.code === activeSet) ?? null
    : null;
  const shouldLoadAllSelectedCards = Boolean(activeSet || activePokemon);
  const requestedTake = CARDS_TAKE_MAX;

  const ownedMasterCardIds = new Set(
    collectionEntries
      .map((entry) => entry.masterCardId?.trim() ?? "")
      .filter((value) => value.length > 0),
  );
  const duplicateOwnedMasterCardIds = getMasterCardIdsWithMinCopies(collectionEntries, 2);

  const [{ entries: cardsForGrid, totalDocs: filteredCount }, initialSearchCardData, fullSetCardsForSummary] = await Promise.all([
    fetchMasterCardsPage({
      activeSet,
      activePokemonDex,
      activePokemonName,
      activeRarity,
      activeEnergy,
      activeSearch,
      activeArtist,
      excludeCommonUncommon,
      excludedMasterCardIds: excludeOwned ? excludedMasterCardIds : undefined,
      includedMasterCardIds: duplicatesOnly
        ? duplicateOwnedMasterCardIds
        : ownedOnly
          ? ownedMasterCardIds
          : undefined,
      categoryQueryVariants,
      page: 1,
      perPage: requestedTake,
      randomSeed,
      sort: effectiveSort,
    }),
    customer ? getSearchCardDataForCustomer(customer.id) : Promise.resolve(null),
    setMeta && customer
      ? fetchMasterCardsPage({
          activeSet,
          activePokemonDex: null,
          activePokemonName: null,
          activeRarity: "",
          activeEnergy: "",
          activeSearch: "",
          activeArtist: "",
          excludeCommonUncommon: false,
          excludedMasterCardIds: undefined,
          includedMasterCardIds: undefined,
          categoryQueryVariants: [],
          page: 1,
          perPage: 5000,
          sort: DEFAULT_SORT,
        }).then((result) => result.entries)
      : Promise.resolve(null),
  ]);

  const [setMarketValue, setCompletionValue, pokemonMarketValue] = await Promise.all([
    setMeta ? fetchSetMarketValue(activeSet) : Promise.resolve(null),
    setMeta && customer && fullSetCardsForSummary
      ? fetchSetCompletionValue(activeSet, fullSetCardsForSummary, ownedMasterCardIds)
      : Promise.resolve(null),
    activePokemonDex ? fetchCardsMarketValue(cardsForGrid, customer ? ownedMasterCardIds : undefined) : Promise.resolve(null),
  ]);

  const selectedSetMissingCount = fullSetCardsForSummary
    ? new Set(
        fullSetCardsForSummary
          .map((card) => card.masterCardId?.trim() ?? "")
          .filter((value) => value.length > 0 && !ownedMasterCardIds.has(value)),
      ).size
    : null;

  const cardMasterCardIds = new Set(cardsForGrid.map((card) => card.masterCardId ?? "").filter(Boolean));
  const ownedPokemonCount = [...cardMasterCardIds].filter((id) => ownedMasterCardIds.has(id)).length;
  const missingPokemonCount =
    activePokemonDex && pokemonMarketValue
      ? pokemonMarketValue.missingCount
      : Math.max(0, filteredCount - ownedPokemonCount);

  const buildCardsHref = () => {
    const params = new URLSearchParams();
    params.set("seed", randomSeed);
    if (activeSet) params.set("set", activeSet);
    if (activePokemon) params.set("pokemon", activePokemon);
    if (activeRarity) params.set("rarity", activeRarity);
    if (effectiveSort) params.set("sort", effectiveSort);
    if (activeEnergy) params.set("energy", activeEnergy);
    if (activeSearch) params.set("search", activeSearch);
    if (activeArtist) params.set("artist", activeArtist);
    if (excludeCommonUncommon) params.set("exclude_cu", "1");
    if (excludeOwned) params.set("exclude_owned", "1");
    if (ownedOnly) params.set("owned_only", "1");
    if (duplicatesOnly) params.set("duplicates_only", "1");
    if (activeCategory) params.set("category", activeCategory);
    const qs = params.toString();
    return `/search${qs ? `?${qs}` : ""}`;
  };

  const scrollRestoreKey = [
    String(cardsForGrid.length),
    randomSeed,
    activeSet,
    activePokemon,
    activeRarity,
    activeEnergy,
    activeSearch,
    activeArtist,
    excludeCommonUncommon ? "1" : "",
    excludeOwned ? "1" : "",
    ownedOnly ? "1" : "",
    duplicatesOnly ? "1" : "",
    activeCategory,
  ].join("|");

  const clearTagFiltersHref = (() => {
    const params = new URLSearchParams();
    params.set("seed", randomSeed);
    if (activeSet) params.set("set", activeSet);
    if (activePokemon) params.set("pokemon", activePokemon);
    if (activeSearch) params.set("search", activeSearch);
    if (effectiveSort) params.set("sort", effectiveSort);
    if (ownedOnly) params.set("owned_only", "1");
    const qs = params.toString();
    return `/search${qs ? `?${qs}` : ""}`;
  })();

  const searchSelectionParams = Object.fromEntries(
    Array.from(new URLSearchParams(buildCardsHref().split("?")[1] ?? "").entries()).filter(
      ([key]) => key !== "set" && key !== "pokemon" && key !== "take" && key !== "return_to",
    ),
  );

  return (
    <div className={searchShellClass}>
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden lg:pr-1">
            {(setMeta || activePokemonOption) ? (
              <div className="mb-2 flex shrink-0 flex-col gap-2">
                {setMeta ? (
                  <SelectedSetHeader
                    setMeta={setMeta}
                    filteredCount={filteredCount}
                    setMarketValue={setMarketValue}
                    setCompletionValue={setCompletionValue}
                    missingCount={selectedSetMissingCount}
                    searchSelectionParams={searchSelectionParams}
                  />
                ) : null}
                {activePokemonOption ? (
                  <SelectedPokemonHeader
                    pokemonName={activePokemonOption.name}
                    pokemonImageUrl={activePokemonOption.imageUrl}
                    filteredCount={filteredCount}
                    marketValue={pokemonMarketValue?.totalValueGbp ?? null}
                    missingCount={customer ? missingPokemonCount : null}
                    missingValue={customer ? (pokemonMarketValue?.missingValueGbp ?? null) : null}
                    searchSelectionParams={searchSelectionParams}
                  />
                ) : null}
              </div>
            ) : null}

              <CardsResultsScroll
              canLoadMore={false}
              loadMoreHref={buildCardsHref()}
              loadMoreStep={CARDS_LOAD_MORE_STEP}
              scrollRestoreKey={scrollRestoreKey}
            >
              <SearchCardsTabGridClient
                key={scrollRestoreKey}
                cards={cardsForGrid}
                initialSearchCardData={initialSearchCardData}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                customerLoggedIn={Boolean(customer)}
                initialVisibleCount={SEARCH_CARDS_INITIAL_TAKE}
                loadMoreStep={CARDS_LOAD_MORE_STEP}
                revealAll={shouldLoadAllSelectedCards}
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
                resetHref={clearTagFiltersHref}
                initialOpenCardMasterCardId={initialOpenCardMasterCardId}
              />
            </CardsResultsScroll>
          </section>
        </div>
      </main>
    </div>
  );
}

function SelectedSetHeader({
  setMeta,
  filteredCount,
  setMarketValue,
  setCompletionValue,
  missingCount,
  searchSelectionParams,
}: {
  setMeta: Awaited<ReturnType<typeof getCachedSetFilterOptions>>[number];
  filteredCount: number;
  setMarketValue: number | null;
  setCompletionValue: Awaited<ReturnType<typeof fetchSetCompletionValue>> | null;
  missingCount: number | null;
  searchSelectionParams: Record<string, string>;
}) {
  const href = buildSelectorHref("/expansions", searchSelectionParams);

  return (
    <header className="flex items-center gap-2 border-b border-[var(--foreground)]/10 pb-2">
      <a
        href={href}
        className="inline-flex h-9 min-w-[36px] shrink-0 items-center justify-center text-[var(--foreground)] transition hover:opacity-75 active:opacity-60"
        aria-label="Choose a different set"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </a>
      <span className="flex h-8 max-w-[4.5rem] shrink-0 items-center justify-center">
        <img src={setMeta.logoSrc} alt="" className="max-h-8 w-auto max-w-full object-contain object-center" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-balance text-sm font-semibold leading-tight tracking-tight sm:text-base">
          {setMeta.name}
        </h1>
        <p className="text-xs text-[var(--foreground)]/60">
          {filteredCount} card{filteredCount === 1 ? "" : "s"}
          {setMarketValue != null ? <> · <span className="text-[var(--foreground)]/80">£{setMarketValue.toFixed(2)} set market value</span></> : null}
        </p>
        {setCompletionValue != null && missingCount != null ? (
          <p className="text-xs text-[var(--foreground)]/80">
            {missingCount} card{missingCount === 1 ? "" : "s"} needed
            {" · "}£{setCompletionValue.totalValueGbp.toFixed(2)} value to complete
          </p>
        ) : null}
      </div>
    </header>
  );
}

function SelectedPokemonHeader({
  pokemonName,
  pokemonImageUrl,
  filteredCount,
  marketValue,
  missingCount,
  missingValue,
  searchSelectionParams,
}: {
  pokemonName: string;
  pokemonImageUrl: string;
  filteredCount: number;
  marketValue: number | null;
  missingCount: number | null;
  missingValue: number | null;
  searchSelectionParams: Record<string, string>;
}) {
  const href = buildSelectorHref("/pokedex", searchSelectionParams);

  return (
    <header className="flex items-center gap-2 border-b border-[var(--foreground)]/10 pb-2">
      <a
        href={href}
        className="inline-flex h-9 min-w-[36px] shrink-0 items-center justify-center text-[var(--foreground)] transition hover:opacity-75 active:opacity-60"
        aria-label="Choose a different Pokemon"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </a>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        <img src={normalizePokemonImageSrc(pokemonImageUrl)} alt="" className="max-h-full max-w-full object-contain object-center" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-balance text-sm font-semibold leading-tight tracking-tight sm:text-base">
          {pokemonName}
        </h1>
        <p className="text-xs text-[var(--foreground)]/60">
          {filteredCount} card{filteredCount === 1 ? "" : "s"}
          {marketValue != null ? <> · <span className="text-[var(--foreground)]/80">£{marketValue.toFixed(2)} market value</span></> : null}
        </p>
        {missingCount != null && missingCount > 0 ? (
          <p className="text-xs text-[var(--foreground)]/80">
            {missingCount} card{missingCount === 1 ? "" : "s"} needed
            {missingValue != null ? <> · £{missingValue.toFixed(2)} to complete</> : null}
          </p>
        ) : null}
      </div>
    </header>
  );
}

function buildSelectorHref(pathname: string, params: Record<string, string>) {
  const search = new URLSearchParams(params).toString();
  return search ? `${pathname}?${search}` : pathname;
}
