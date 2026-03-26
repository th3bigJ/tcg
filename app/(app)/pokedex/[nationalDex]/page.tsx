import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchCardGrid } from "@/components/SearchCardGrid";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import {
  getCachedPokemonFilterOptions,
  getCachedSetFilterOptions,
} from "@/lib/cardsFilterOptionsServer";
import {
  CARDS_LOAD_MORE_STEP,
  fetchMasterCardsPage,
  getCachedFilterFacets,
  resolveCardsTakeFromParams,
} from "@/lib/cardsPageQueries";
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";
import { getCurrentCustomer } from "@/lib/auth";

type PokedexPokemonCardsPageProps = {
  params: Promise<{ nationalDex: string }>;
  searchParams?: Promise<{
    take?: string;
    page?: string;
  }>;
};

export default async function PokedexPokemonCardsPage({
  params,
  searchParams,
}: PokedexPokemonCardsPageProps) {
  const { nationalDex: rawDex } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const dexNum = Number.parseInt(decodeURIComponent(rawDex).trim(), 10);
  if (!Number.isFinite(dexNum) || dexNum <= 0) notFound();

  const pokemonOptions = await getCachedPokemonFilterOptions();
  const pokemonMeta = pokemonOptions.find((p) => p.nationalDexNumber === dexNum) ?? null;
  if (!pokemonMeta) notFound();

  const facets = (await getCachedFilterFacets()) ?? {};
  const availableSetCodes = facets.setCodes ?? [];
  const setFilterOptions = await getCachedSetFilterOptions(availableSetCodes);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );
  const setSymbolsByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.symbolSrc]),
  );

  const requestedTake = resolveCardsTakeFromParams(
    resolvedSearchParams.take,
    resolvedSearchParams.page,
  );

  const [{ entries: cardsForGrid, totalDocs: filteredCount }, customer] = await Promise.all([
    fetchMasterCardsPage({
      activeSet: "",
      activePokemonDex: dexNum,
      activePokemonName: pokemonMeta.name,
      activeRarity: "",
      activeSearch: "",
      activeArtist: "",
      excludeCommonUncommon: false,
      categoryQueryVariants: [],
      page: 1,
      perPage: requestedTake,
    }),
    getCurrentCustomer(),
  ]);

  const cardsForClient = cardsForGrid;

  const showingCount = cardsForClient.length;
  const nextTake = Math.min(filteredCount, showingCount + CARDS_LOAD_MORE_STEP);
  const canLoadMore = showingCount > 0 && showingCount < filteredCount;

  const dexPath = `/pokedex/${dexNum}`;
  const buildPokedexPokemonHref = (take?: number) => {
    if (take !== undefined && take > 0) {
      return `${dexPath}?take=${encodeURIComponent(String(take))}`;
    }
    return dexPath;
  };
  const loadMoreHref = buildPokedexPokemonHref(nextTake);
  const scrollRestoreKey = [String(requestedTake), String(dexNum), "pokedex-pokemon"].join("|");

  const imageSrc = normalizePokemonImageSrc(pokemonMeta.imageUrl);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pt-4">
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="mb-0 flex shrink-0 items-center gap-2 border-b border-[var(--foreground)]/10 pb-2">
            <Link
              href="/search?tab=pokedex"
              prefetch={false}
              className="inline-flex h-9 min-w-[36px] shrink-0 items-center justify-center text-[var(--foreground)] transition hover:opacity-75 active:opacity-60"
              aria-label="Back to Pokédex"
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
            <span className="flex h-8 w-8 shrink-0 items-center justify-center">
              <img
                src={imageSrc}
                alt=""
                className="max-h-full max-w-full object-contain object-center"
              />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-balance text-sm font-semibold leading-tight tracking-tight sm:text-base">
                {pokemonMeta.name}
              </h1>
              <p className="text-xs text-[var(--foreground)]/60">
                {filteredCount} card{filteredCount === 1 ? "" : "s"}
              </p>
            </div>
          </header>

          <div className="mt-4 min-h-0 flex-1">
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
                formAction={`/pokedex/${dexNum}`}
                activeSearch=""
                activeSet=""
                activePokemon={String(dexNum)}
                activeRarity=""
                activeCategory=""
                excludeCommonUncommon={false}
                rarityOptions={[]}
                categoryOptions={[]}
                resetHref={`/pokedex/${dexNum}`}
              />
            </CardsResultsScroll>
          </div>
        </div>
      </main>
    </div>
  );
}
