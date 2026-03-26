import Link from "next/link";
import { SearchTabSwipeContainer } from "@/components/SearchTabSwipeContainer";
import { SearchCardGrid } from "@/components/SearchCardGrid";
import { CardFiltersPanel } from "@/components/CardFiltersPanel";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { ExpansionsList } from "@/components/ExpansionsList";
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
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMaps";
import type { StorefrontCardEntry } from "@/lib/storefrontCardMaps";

function parseExcludeCommonUncommon(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

type SearchPageProps = {
  searchParams?: Promise<{
    tab?: string;
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

const TABS = ["cards", "sets", "pokedex"] as const;
type Tab = (typeof TABS)[number];

function resolveTab(raw: string | undefined): Tab {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "sets" || v === "pokedex") return v;
  return "cards";
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeTab = resolveTab(resolvedSearchParams.tab);

  // ── Shared ────────────────────────────────────────────────────────────────
  const customer = await getCurrentCustomer();

  // ── Cards tab ─────────────────────────────────────────────────────────────
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

  const [{ entries: cardsForGrid, totalDocs: filteredCount }, expansionRows, collectionEntriesForModal] = await Promise.all([
    fetchMasterCardsPage({
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
    }),
    getCachedExpansionSetRows(),
    customer ? fetchCollectionCardEntries(customer.id) : Promise.resolve([] as StorefrontCardEntry[]),
  ]);

  const cardsForClient = cardsForGrid;

  // ── Sets tab ──────────────────────────────────────────────────────────────
  const expansionGroups = groupExpansionSetsBySeries(expansionRows);

  let uniqueOwnedBySetCode: Record<string, number> | null = null;
  if (customer) {
    uniqueOwnedBySetCode = {};
    const seenBySetCode = new Map<string, Set<string>>();
    for (const entry of collectionEntriesForModal) {
      const setCode = typeof entry.set === "string" ? entry.set.trim() : "";
      if (!setCode || setCode === "unknown") continue;
      const uniqueCardKey =
        entry.masterCardId ??
        [entry.set, entry.cardNumber, entry.filename].filter(Boolean).join("|");
      if (!uniqueCardKey) continue;
      const seen = seenBySetCode.get(setCode) ?? new Set<string>();
      seen.add(uniqueCardKey);
      seenBySetCode.set(setCode, seen);
    }
    for (const [setCode, seen] of seenBySetCode.entries()) {
      uniqueOwnedBySetCode[setCode] = seen.size;
    }
  }

  // ── Pokédex tab ───────────────────────────────────────────────────────────
  const TOTAL_POKEMON_COUNT = 1025;
  const collectedDexIds = new Set<number>();
  for (const entry of collectionEntriesForModal) {
    const dexIds = Array.isArray(entry.dexIds) ? entry.dexIds : [];
    for (const dexId of dexIds) {
      if (!Number.isFinite(dexId) || dexId <= 0) continue;
      const normalized = Math.trunc(dexId);
      if (normalized >= 1 && normalized <= TOTAL_POKEMON_COUNT) collectedDexIds.add(normalized);
    }
  }

  // ── Cards tab helpers ─────────────────────────────────────────────────────
  const showingCount = cardsForClient.length;
  const nextTake = Math.min(filteredCount, showingCount + CARDS_LOAD_MORE_STEP);
  const canLoadMore = showingCount > 0 && showingCount < filteredCount;

  const buildCardsHref = (take?: number) => {
    const params = new URLSearchParams({ tab: "cards" });
    if (activeSet) params.set("set", activeSet);
    if (activePokemon) params.set("pokemon", activePokemon);
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeSearch) params.set("search", activeSearch);
    if (activeArtist) params.set("artist", activeArtist);
    if (excludeCommonUncommon) params.set("exclude_cu", "1");
    if (activeCategory) params.set("category", activeCategory);
    if (take !== undefined && take > 0) params.set("take", String(take));
    return `/search?${params.toString()}`;
  };

  const loadMoreHref = buildCardsHref(nextTake);
  const scrollRestoreKey = [
    activeTab,
    String(requestedTake),
    activeSet,
    activePokemon,
    activeRarity,
    activeSearch,
    activeArtist,
    excludeCommonUncommon ? "1" : "",
    activeCategory,
  ].join("|");

  // Used by desktop sidebar to clear set/pokemon filters (keeps rarity/search/category)
  const resetFiltersHref = (() => {
    const params = new URLSearchParams({ tab: "cards" });
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeSearch) params.set("search", activeSearch);
    if (excludeCommonUncommon) params.set("exclude_cu", "1");
    if (activeCategory) params.set("category", activeCategory);
    return `/search?${params.toString()}`;
  })();

  // Used by the tag row "Clear filters" — clears rarity/category/exclude_cu but keeps set/pokemon/search
  const clearTagFiltersHref = (() => {
    const params = new URLSearchParams({ tab: "cards" });
    if (activeSet) params.set("set", activeSet);
    if (activePokemon) params.set("pokemon", activePokemon);
    if (activeSearch) params.set("search", activeSearch);
    return `/search?${params.toString()}`;
  })();

  // ── Tab nav links ─────────────────────────────────────────────────────────
  const tabLinks: { tab: Tab; label: string }[] = [
    { tab: "cards", label: "All Cards" },
    { tab: "sets", label: "Sets" },
    { tab: "pokedex", label: "Pokédex" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:box-border lg:flex lg:h-[calc(100dvh-var(--bottom-nav-offset))] lg:max-h-[calc(100dvh-var(--bottom-nav-offset))] lg:min-h-0 lg:shrink-0">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-[var(--foreground)]/10 px-4 pt-4">
        <div className="flex gap-1">
          {tabLinks.map(({ tab, label }) => (
            <Link
              key={tab}
              href={`/search?tab=${tab}`}
              prefetch={false}
              className={`rounded-t px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "border-b-2 border-[var(--foreground)] text-[var(--foreground)]"
                  : "text-[var(--foreground)]/50 hover:text-[var(--foreground)]/75"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <SearchTabSwipeContainer activeTab={activeTab}>
      {/* ── All Cards tab ── */}
      {activeTab === "cards" && (
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <div className="grid min-h-0 flex-1 items-stretch gap-4 overflow-hidden lg:grid-cols-[20%_minmax(0,1fr)] lg:flex-1 lg:min-h-0 lg:overflow-hidden">
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
                  categoryOptions={categoryOptions}
                  activeSet={activeSet}
                  activePokemonDex={activePokemon}
                  activeRarity={activeRarity}
                  activeSearch={activeSearch}
                  excludeCommonUncommon={excludeCommonUncommon}
                  activeCategory={activeCategory}
                  showSetPokemonFilter={false}
                />
              </div>
            </aside>
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:pr-1">
              <CardsResultsScroll
                canLoadMore={canLoadMore}
                loadMoreHref={loadMoreHref}
                loadMoreStep={CARDS_LOAD_MORE_STEP}
                scrollRestoreKey={scrollRestoreKey}
              >
                <SearchCardGrid
                  cards={cardsForClient}
                  setLogosByCode={setLogosByCode}
                  setSymbolsByCode={setSymbolsByCode}
                  customerLoggedIn={Boolean(customer)}
                  formAction="/search"
                  extraHiddenFields={{ tab: "cards" }}
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
      )}

      {/* ── Sets tab ── */}
      {activeTab === "sets" && (
        <main className="min-h-full flex-1 overflow-y-auto px-4 pb-8 pt-4">
          <ExpansionsList groups={expansionGroups} uniqueOwnedBySetCode={uniqueOwnedBySetCode} />
        </main>
      )}

      {/* ── Pokédex tab ── */}
      {activeTab === "pokedex" && (
        <main className="min-h-full flex-1 overflow-y-auto px-4 pb-[max(1.5rem,var(--bottom-nav-offset))] pt-4">
          {customer ? (
            <p className="mb-4 text-sm text-[var(--foreground)]/70">
              {collectedDexIds.size} of {TOTAL_POKEMON_COUNT} Pokemon collected
            </p>
          ) : (
            <div className="mb-4" aria-hidden />
          )}
          <ul className="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-7">
            {pokemonFilterOptions.map((item) => (
              <li key={item.nationalDexNumber}>
                <Link
                  href={`/pokedex/${item.nationalDexNumber}`}
                  prefetch={false}
                  className="flex flex-col items-center gap-2 rounded-xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-2 py-3 text-center shadow-sm transition hover:border-[var(--foreground)]/22 hover:bg-[var(--foreground)]/8 active:opacity-90"
                  aria-label={`View cards for ${item.name}`}
                >
                  <img
                    src={normalizePokemonImageSrc(item.imageUrl)}
                    alt=""
                    className="h-14 w-14 object-contain sm:h-16 sm:w-16"
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="line-clamp-2 text-[11px] font-semibold leading-snug sm:text-xs">
                    {item.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </main>
      )}
      </SearchTabSwipeContainer>
    </div>
  );
}

