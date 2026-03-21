import Link from "next/link";
import { unstable_cache } from "next/cache";
import { CardGrid } from "@/components/CardGrid";
import { CardFiltersPanel } from "@/components/CardFiltersPanel";
import { CardsMobileControls } from "@/components/CardsMobileControls";
import {
  CARDS_PER_PAGE,
  fetchMasterCardsPage,
  getCachedFilterFacets,
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
      imageUrl: true,
    },
    sort: "nationalDexNumber",
  });

  const deduped = new Map<number, PokemonFilterOption>();

  for (const doc of result.docs) {
    const dex = typeof doc.nationalDexNumber === "number" ? doc.nationalDexNumber : null;
    const name = typeof doc.name === "string" ? doc.name.trim() : "";
    const mediaRelation = isImageRelation(doc.pokemonMedia) ? doc.pokemonMedia : null;
    const mediaUrl = typeof mediaRelation?.url === "string" ? mediaRelation.url.trim() : "";
    const fallbackUrl = typeof doc.imageUrl === "string" ? doc.imageUrl.trim() : "";
    const imageUrl = mediaUrl || fallbackUrl;
    if (!dex || !name || !imageUrl || deduped.has(dex)) continue;
    deduped.set(dex, { nationalDexNumber: dex, name, imageUrl: resolvePokemonMediaURL(imageUrl) });
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

type CardsPageProps = {
  searchParams?: Promise<{
    page?: string;
    set?: string;
    pokemon?: string;
    rarity?: string;
    search?: string;
  }>;
};

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedSet = (resolvedSearchParams.set ?? "").trim();
  const selectedPokemon = (resolvedSearchParams.pokemon ?? "").trim();
  const selectedRarity = (resolvedSearchParams.rarity ?? "").trim();
  const selectedSearch = (resolvedSearchParams.search ?? "").trim();
  const { setCodes: availableSetCodes, rarityDisplayValues: rarityOptions } =
    await getCachedFilterFacets();
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
  const rawPageParsed = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const requestedPage =
    Number.isFinite(rawPageParsed) && rawPageParsed > 0 ? rawPageParsed : 1;

  let { entries: cardsForGrid, totalDocs: filteredCount } = await fetchMasterCardsPage({
    activeSet,
    activePokemonDex,
    activePokemonName,
    activeRarity,
    activeSearch,
    page: requestedPage,
  });

  const totalPages = Math.max(1, Math.ceil(filteredCount / CARDS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);

  if (currentPage !== requestedPage) {
    ({ entries: cardsForGrid, totalDocs: filteredCount } = await fetchMasterCardsPage({
      activeSet,
      activePokemonDex,
      activePokemonName,
      activeRarity,
      activeSearch,
      page: currentPage,
    }));
  }
  const startIndex = (currentPage - 1) * CARDS_PER_PAGE;
  const showingFrom = filteredCount === 0 ? 0 : startIndex + 1;
  const showingTo = Math.min(startIndex + cardsForGrid.length, filteredCount);
  const createCardsHref = (page: number) => {
    const params = new URLSearchParams();
    if (activeSet) params.set("set", activeSet);
    if (activePokemon) params.set("pokemon", activePokemon);
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeSearch) params.set("search", activeSearch);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/cards?${query}` : "/cards";
  };
  const previousHref = createCardsHref(currentPage - 1);
  const nextHref = createCardsHref(currentPage + 1);

  const resetFiltersHref = (() => {
    const params = new URLSearchParams();
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeSearch) params.set("search", activeSearch);
    const query = params.toString();
    return query ? `/cards?${query}` : "/cards";
  })();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
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
              activeSet={activeSet}
              activePokemonDex={activePokemon}
              activeRarity={activeRarity}
              activeSearch={activeSearch}
            />
          </aside>
          <section className="flex min-h-0 flex-col lg:pr-1">
            <CardsMobileControls
              activeSet={activeSet}
              activePokemon={activePokemon}
              activeRarity={activeRarity}
              activeSearch={activeSearch}
              rarityOptions={rarityOptions}
              resetFiltersHref={resetFiltersHref}
              setFilterOptions={setFilterOptions}
              pokemonFilterOptions={pokemonFilterOptions}
            />
            <div className="mb-4 hidden shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex">
              <form method="get" action="/cards" className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {activeSet ? <input type="hidden" name="set" value={activeSet} /> : null}
                {activePokemon ? <input type="hidden" name="pokemon" value={activePokemon} /> : null}
                <input
                  type="search"
                  name="search"
                  defaultValue={activeSearch}
                  placeholder="Search card name"
                  aria-label="Search card name"
                  className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-1.5 text-xs shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_8px_20px_rgba(0,0,0,0.18)] outline-none transition focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/20 sm:w-72"
                />
                <div className="relative w-28 max-w-28 min-w-28">
                  <select
                    id="rarity"
                    name="rarity"
                    defaultValue={activeRarity}
                    className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-1.5 pr-7 text-xs shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] outline-none transition focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/20 [appearance:none] [-webkit-appearance:none] [background-image:none]"
                  >
                    <option value="">All rarities</option>
                    {rarityOptions.map((rarity) => (
                      <option key={rarity} value={rarity}>
                        {rarity}
                      </option>
                    ))}
                  </select>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--foreground)]/55"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
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
                {activeSet || activePokemon || activeRarity || activeSearch ? " (filtered)" : ""}
              </p>
            </div>
            <div className="scrollbar-hide min-h-0 overflow-y-auto">
              <CardGrid
                cards={cardsForGrid}
                setLogosByCode={setLogosByCode}
                similarMode={activePokemon ? "pokemon" : "set"}
                previousPageHref={currentPage > 1 ? previousHref : undefined}
                nextPageHref={currentPage < totalPages ? nextHref : undefined}
              />
            </div>
            <div className="mt-4 shrink-0 flex items-center justify-between gap-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-sm lg:pb-0">
              {currentPage > 1 ? (
                <Link
                  href={previousHref}
                  className="rounded-md border border-[var(--foreground)]/20 px-3 py-2 hover:bg-[var(--foreground)]/5"
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded-md border border-[var(--foreground)]/10 px-3 py-2 text-[var(--foreground)]/50">
                  Previous
                </span>
              )}
              <span className="text-[var(--foreground)]/70">
                Page {currentPage} of {totalPages}
              </span>
              {currentPage < totalPages ? (
                <Link
                  href={nextHref}
                  className="rounded-md border border-[var(--foreground)]/20 px-3 py-2 hover:bg-[var(--foreground)]/5"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-md border border-[var(--foreground)]/10 px-3 py-2 text-[var(--foreground)]/50">
                  Next
                </span>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
