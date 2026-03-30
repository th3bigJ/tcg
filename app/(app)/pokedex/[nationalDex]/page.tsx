import Link from "next/link";
import { notFound } from "next/navigation";
import { PokedexCardGrid } from "@/components/PokedexCardGrid";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import {
  getCachedPokemonFilterOptions,
  getCachedSetFilterOptions,
} from "@/lib/cardsFilterOptionsServer";
import {
  CARDS_TAKE_MAX,
  fetchMasterCardsPage,
  fetchCardsMarketValue,
  getCachedFilterFacets,
} from "@/lib/cardsPageQueries";
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";

type PokedexPokemonCardsPageProps = {
  params: Promise<{ nationalDex: string }>;
  searchParams?: Promise<Record<string, string>>;
};

export default async function PokedexPokemonCardsPage({
  params,
}: PokedexPokemonCardsPageProps) {
  const { nationalDex: rawDex } = await params;
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
      perPage: CARDS_TAKE_MAX,
    }),
    getCurrentCustomer(),
  ]);

  const collectionEntries = customer ? await fetchCollectionCardEntries(customer.id) : [];
  const ownedMasterCardIds = new Set(
    collectionEntries.map((e) => e.masterCardId?.trim() ?? "").filter((v) => v.length > 0),
  );
  const cardMasterCardIds = new Set(cardsForGrid.map((c) => c.masterCardId ?? "").filter(Boolean));
  const ownedCount = [...cardMasterCardIds].filter((id) => ownedMasterCardIds.has(id)).length;
  const marketValue = await fetchCardsMarketValue(cardsForGrid, customer ? ownedMasterCardIds : undefined);
  const missingCount = marketValue?.missingCount ?? (filteredCount - ownedCount);

  const scrollRestoreKey = [String(dexNum), "pokedex-pokemon"].join("|");

  const imageSrc = normalizePokemonImageSrc(pokemonMeta.imageUrl);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pt-[var(--mobile-page-top-offset)]">
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
                {marketValue != null ? (
                  <> · <span className="text-[var(--foreground)]/80">£{marketValue.totalValueGbp.toFixed(2)} market value</span></>
                ) : null}
              </p>
              {customer && missingCount > 0 ? (
                <p className="text-xs text-[var(--foreground)]/80">
                  {missingCount} card{missingCount === 1 ? "" : "s"} needed · £{marketValue?.missingValueGbp.toFixed(2) ?? "—"} to complete
                </p>
              ) : null}
            </div>
          </header>

          <div className="mt-4 min-h-0 flex-1">
            <CardsResultsScroll
              canLoadMore={false}
              loadMoreHref=""
              loadMoreStep={0}
              scrollRestoreKey={scrollRestoreKey}
            >
              <PokedexCardGrid
                cards={cardsForGrid}
                setLogosByCode={setLogosByCode}
                setSymbolsByCode={setSymbolsByCode}
                customerLoggedIn={Boolean(customer)}
              />
            </CardsResultsScroll>
          </div>
        </div>
      </main>
    </div>
  );
}
