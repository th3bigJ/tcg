import Link from "next/link";
import { notFound } from "next/navigation";
import { CardGrid } from "@/components/CardGrid";
import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { getCachedSetFilterOptions } from "@/lib/cardsFilterOptionsServer";
import {
  CARDS_LOAD_MORE_STEP,
  fetchMasterCardsPage,
  getCachedFilterFacets,
  resolveCardsTakeFromParams,
} from "@/lib/cardsPageQueries";

type ExpansionSetCardsPageProps = {
  params: Promise<{ setCode: string }>;
  searchParams?: Promise<{
    take?: string;
    page?: string;
  }>;
};

export default async function ExpansionSetCardsPage({
  params,
  searchParams,
}: ExpansionSetCardsPageProps) {
  const { setCode: rawSetCode } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeSet = decodeURIComponent(rawSetCode).trim();
  if (!activeSet) notFound();

  const setRows = await getCachedSetFilterOptions([activeSet]);
  if (setRows.length === 0) notFound();
  const setMeta = setRows[0];

  const facets = (await getCachedFilterFacets()) ?? {};
  const availableSetCodes = facets.setCodes ?? [];
  const setFilterOptions = await getCachedSetFilterOptions(availableSetCodes);
  const setLogosByCode = Object.fromEntries(
    setFilterOptions.map((option) => [option.code, option.logoSrc]),
  );

  const requestedTake = resolveCardsTakeFromParams(
    resolvedSearchParams.take,
    resolvedSearchParams.page,
  );

  const { entries: cardsForGrid, totalDocs: filteredCount } = await fetchMasterCardsPage({
    activeSet,
    activePokemonDex: null,
    activePokemonName: null,
    activeRarity: "",
    activeSearch: "",
    excludeCommonUncommon: false,
    categoryQueryVariants: [],
    page: 1,
    perPage: requestedTake,
  });

  const cardsForClient = JSON.parse(JSON.stringify(cardsForGrid)) as typeof cardsForGrid;

  const showingCount = cardsForClient.length;
  const nextTake = Math.min(filteredCount, showingCount + CARDS_LOAD_MORE_STEP);
  const canLoadMore = showingCount > 0 && showingCount < filteredCount;

  const setPath = `/expansions/${encodeURIComponent(activeSet)}`;
  const buildSetCardsHref = (take?: number) => {
    if (take !== undefined && take > 0) {
      return `${setPath}?take=${encodeURIComponent(String(take))}`;
    }
    return setPath;
  };
  const loadMoreHref = buildSetCardsHref(nextTake);
  const scrollRestoreKey = [String(requestedTake), activeSet, "expansion-set"].join("|");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-4">
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="mb-4 flex shrink-0 items-center gap-3 border-b border-[var(--foreground)]/10 pb-4">
            <Link
              href="/expansions"
              prefetch={false}
              className="inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center text-[var(--foreground)] transition hover:opacity-75 active:opacity-60"
              aria-label="Back to sets"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
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
            <span className="flex h-14 max-w-[5.5rem] shrink-0 items-center justify-center">
              <img
                src={setMeta.logoSrc}
                alt=""
                className="max-h-14 w-auto max-w-full object-contain object-center"
              />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-balance text-lg font-semibold leading-tight tracking-tight sm:text-xl">
                {setMeta.name}
              </h1>
              <p className="mt-1 text-xs text-[var(--foreground)]/60 sm:text-sm">
                {filteredCount} card{filteredCount === 1 ? "" : "s"}
              </p>
            </div>
          </header>

          <div className="min-h-0 flex-1">
            <CardsResultsScroll
              canLoadMore={canLoadMore}
              loadMoreHref={loadMoreHref}
              loadMoreStep={CARDS_LOAD_MORE_STEP}
              scrollRestoreKey={scrollRestoreKey}
            >
              <CardGrid cards={cardsForClient} setLogosByCode={setLogosByCode} />
            </CardsResultsScroll>
          </div>
        </div>
      </main>
    </div>
  );
}
