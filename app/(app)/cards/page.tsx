import Link from "next/link";
import { unstable_cache } from "next/cache";
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
import { resolveMediaURL, resolvePokemonMediaURL } from "@/lib/media";

type ImageRelation = {
  url?: string | null;
  filename?: string | null;
};

type SetFilterOption = {
  code: string;
  name: string;
  logoSrc: string;
  symbolSrc: string;
  releaseYear: number | null;
  seriesName: string;
  cardCountOfficial: number | null;
  cardCountTotal: number | null;
};

type PokemonFilterOption = {
  nationalDexNumber: number;
  name: string;
  imageUrl: string;
};

const isImageRelation = (value: unknown): value is ImageRelation =>
  Boolean(value) && typeof value === "object";

const looksLikeFilename = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes("/") || /^https?:\/\//i.test(trimmed)) return false;
  return /\.[a-z0-9]+$/i.test(trimmed);
};

async function getSetFilterOptions(setCodes: string[]): Promise<SetFilterOption[]> {
  if (setCodes.length === 0) return [];

  const payloadConfig = (await import("../../../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const result = await payload.find({
    collection: "sets",
    depth: 1,
    limit: setCodes.length,
    overrideAccess: true,
    select: {
      code: true,
      name: true,
      setImage: true,
      symbolImage: true,
      releaseDate: true,
      cardCountTotal: true,
      cardCountOfficial: true,
      serieName: true,
    },
    where: {
      and: [
        {
          code: {
            in: setCodes,
          },
        },
        {
          setImage: {
            exists: true,
          },
        },
      ],
    },
  });

  return result.docs
    .map((doc) => {
      const code = typeof doc.code === "string" ? doc.code : "";
      const name = typeof doc.name === "string" ? doc.name : code;
      const image = isImageRelation(doc.setImage) ? doc.setImage : null;
      const imageUrl = typeof image?.url === "string" ? image.url : "";
      const symbolImage = isImageRelation(doc.symbolImage) ? doc.symbolImage : null;
      const symbolUrl = typeof symbolImage?.url === "string" ? symbolImage.url : "";
      const releaseYear =
        typeof doc.releaseDate === "string" ? new Date(doc.releaseDate).getUTCFullYear() : null;
      const seriesName =
        typeof doc.serieName === "object" &&
        doc.serieName &&
        "name" in doc.serieName &&
        typeof doc.serieName.name === "string"
          ? doc.serieName.name
          : "Uncategorized";
      const cardCountOfficial =
        typeof doc.cardCountOfficial === "number" ? doc.cardCountOfficial : null;
      const cardCountTotal = typeof doc.cardCountTotal === "number" ? doc.cardCountTotal : null;
      if (!code || !imageUrl) return null;
      return {
        code,
        name,
        logoSrc: resolveMediaURL(imageUrl),
        symbolSrc: symbolUrl ? resolveMediaURL(symbolUrl) : "",
        releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
        seriesName,
        cardCountOfficial,
        cardCountTotal,
      };
    })
    .filter((option): option is SetFilterOption => Boolean(option))
    .sort((a, b) => {
      const yearA = a.releaseYear ?? 0;
      const yearB = b.releaseYear ?? 0;
      if (yearA !== yearB) return yearB - yearA;
      return a.name.localeCompare(b.name);
    });
}

async function getPokemonFilterOptions(): Promise<PokemonFilterOption[]> {
  const payloadConfig = (await import("../../../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const result = await payload.find({
    collection: "pokemon",
    depth: 1,
    limit: 1200,
    page: 1,
    overrideAccess: true,
    select: {
      nationalDexNumber: true,
      name: true,
      pokemonMedia: true,
      imageFilename: true,
      imageUrl: true,
    },
    sort: "nationalDexNumber",
  });

  const deduped = new Map<number, PokemonFilterOption>();

  for (const doc of result.docs) {
    const dex = typeof doc.nationalDexNumber === "number" ? doc.nationalDexNumber : null;
    const name = typeof doc.name === "string" ? doc.name.trim() : "";
    const imageFilename = typeof doc.imageFilename === "string" ? doc.imageFilename.trim() : "";
    const mediaRelation = isImageRelation(doc.pokemonMedia) ? doc.pokemonMedia : null;
    const mediaFilename =
      typeof mediaRelation?.filename === "string" ? mediaRelation.filename.trim() : "";
    const mediaUrl = typeof mediaRelation?.url === "string" ? mediaRelation.url.trim() : "";
    const fallbackUrl = typeof doc.imageUrl === "string" ? doc.imageUrl.trim() : "";
    // Prefer filename-based resolution through the pokemon media resolver so
    // public R2 bucket URLs (pokemon bucket) are used consistently in live.
    const resolvedFilename = imageFilename || mediaFilename;
    const imageUrl = resolvedFilename
      ? resolvePokemonMediaURL(resolvedFilename)
      : looksLikeFilename(fallbackUrl)
        ? resolvePokemonMediaURL(fallbackUrl)
        : resolvePokemonMediaURL(fallbackUrl || mediaUrl);
    if (!dex || !name || !imageUrl || deduped.has(dex)) continue;
    deduped.set(dex, { nationalDexNumber: dex, name, imageUrl });
  }

  return [...deduped.values()].sort(
    (a, b) => a.nationalDexNumber - b.nationalDexNumber || a.name.localeCompare(b.name),
  );
}

const getCachedSetFilterOptions = unstable_cache(
  async (setCodes: string[]) => getSetFilterOptions(setCodes),
  ["cards-page-set-filter-options-v1"],
  { revalidate: 300 },
);

const getCachedPokemonFilterOptions = unstable_cache(
  async () => getPokemonFilterOptions(),
  ["cards-page-pokemon-filter-options-v1"],
  { revalidate: 300 },
);

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

  const showingCount = cardsForGrid.length;
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
              <CardGrid cards={cardsForGrid} setLogosByCode={setLogosByCode} />
            </CardsResultsScroll>
          </section>
        </div>
      </main>
    </div>
  );
}
