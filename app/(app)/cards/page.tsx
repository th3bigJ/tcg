import Link from "next/link";
import { CardGrid } from "@/components/CardGrid";
import {
  CARDS_PER_PAGE,
  type CardsPageCardEntry,
  fetchMasterCardsPage,
  getCachedFilterFacets,
} from "@/lib/cardsPageQueries";
import { resolveMediaURL } from "@/lib/media";

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

type CardsPageProps = {
  searchParams?: Promise<{
    page?: string;
    set?: string;
    rarity?: string;
    search?: string;
  }>;
};

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedSet = (resolvedSearchParams.set ?? "").trim();
  const selectedRarity = (resolvedSearchParams.rarity ?? "").trim();
  const selectedSearch = (resolvedSearchParams.search ?? "").trim();
  const { setCodes: availableSetCodes, rarityDisplayValues: rarityOptions } =
    await getCachedFilterFacets();
  const setFilterOptions = await getSetFilterOptions(availableSetCodes);
  const hasSelectedSet = setFilterOptions.some((option) => option.code === selectedSet);
  const hasSelectedRarity = rarityOptions.includes(selectedRarity);
  const activeSet = hasSelectedSet ? selectedSet : "";
  const activeRarity = hasSelectedRarity ? selectedRarity : "";
  const activeSearch = selectedSearch;
  const activeSetOption = setFilterOptions.find((option) => option.code === activeSet) ?? null;
  const groupedSetOptions = (() => {
    const groups = new Map<string, SetFilterOption[]>();
    for (const option of setFilterOptions) {
      const key = option.seriesName || "Uncategorized";
      const options = groups.get(key) ?? [];
      options.push(option);
      groups.set(key, options);
    }

    return [...groups.entries()]
      .map(([seriesName, options]) => {
        const sortedOptions = [...options].sort((a, b) => {
          const yearA = a.releaseYear ?? 0;
          const yearB = b.releaseYear ?? 0;
          if (yearA !== yearB) return yearB - yearA;
          return a.name.localeCompare(b.name);
        });

        return {
          seriesName,
          options: sortedOptions,
          oldestYear: Math.min(...sortedOptions.map((option) => option.releaseYear ?? 9999)),
        };
      })
      .sort((a, b) => {
        // Newest series first: sort groups by the oldest set in each series (descending year).
        if (a.oldestYear !== b.oldestYear) return b.oldestYear - a.oldestYear;
        return a.seriesName.localeCompare(b.seriesName);
      });
  })();
  const otherSetsInSeries = activeSetOption
    ? setFilterOptions
        .filter(
          (option) =>
            option.seriesName === activeSetOption.seriesName && option.code !== activeSetOption.code,
        )
        .sort((a, b) => {
          const yearA = a.releaseYear ?? 0;
          const yearB = b.releaseYear ?? 0;
          if (yearA !== yearB) return yearB - yearA;
          return a.name.localeCompare(b.name);
        })
    : [];

  const rawPageParsed = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const requestedPage =
    Number.isFinite(rawPageParsed) && rawPageParsed > 0 ? rawPageParsed : 1;

  let { entries: cardsForGrid, totalDocs: filteredCount } = await fetchMasterCardsPage({
    activeSet,
    activeRarity,
    activeSearch,
    page: requestedPage,
  });

  const totalPages = Math.max(1, Math.ceil(filteredCount / CARDS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);

  if (currentPage !== requestedPage) {
    ({ entries: cardsForGrid, totalDocs: filteredCount } = await fetchMasterCardsPage({
      activeSet,
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
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeSearch) params.set("search", activeSearch);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/cards?${query}` : "/cards";
  };
  const previousHref = createCardsHref(currentPage - 1);
  const nextHref = createCardsHref(currentPage + 1);

  const changeSetHref = (() => {
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
          <aside className="flex min-h-0 h-full flex-col rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-2">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Filters</h2>
              {activeSetOption ? (
                <Link
                  href={changeSetHref}
                  prefetch={false}
                  className="inline-flex rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-2 py-1 text-xs font-medium transition hover:bg-[var(--foreground)]/18"
                >
                  Change set
                </Link>
              ) : null}
            </div>
            <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto pr-1">
              {activeSetOption ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg border border-[var(--foreground)]/15 bg-[var(--foreground)]/6 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
                    <img
                      src={activeSetOption.logoSrc}
                      alt={activeSetOption.name}
                      className="mx-auto h-16 w-full object-contain"
                    />
                  </div>
                  <div className="rounded-lg border border-[var(--foreground)]/15 bg-[var(--foreground)]/4 p-4 text-xs shadow-[0_6px_20px_rgba(0,0,0,0.16)]">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold tracking-wide">{activeSetOption.name}</p>
                      {activeSetOption.symbolSrc ? (
                        <img
                          src={activeSetOption.symbolSrc}
                          alt={`${activeSetOption.name} symbol`}
                          className="h-5 w-auto shrink-0 object-contain"
                        />
                      ) : null}
                    </div>
                    <dl className="space-y-2 text-[var(--foreground)]/85">
                      <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--foreground)]/6 px-2 py-1.5">
                        <dt>Series</dt>
                        <dd className="text-right font-medium">{activeSetOption.seriesName}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--foreground)]/6 px-2 py-1.5">
                        <dt>Release year</dt>
                        <dd className="font-medium">{activeSetOption.releaseYear ?? "Unknown"}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--foreground)]/6 px-2 py-1.5">
                        <dt>Main Set Count</dt>
                        <dd className="font-medium">{activeSetOption.cardCountOfficial ?? "Unknown"}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--foreground)]/6 px-2 py-1.5">
                        <dt>Master Set Count</dt>
                        <dd className="font-medium">{activeSetOption.cardCountTotal ?? "Unknown"}</dd>
                      </div>
                    </dl>
                  </div>
                  {otherSetsInSeries.length > 0 ? (
                    <div className="rounded-lg border border-[var(--foreground)]/15 bg-[var(--foreground)]/4 p-4 shadow-[0_6px_20px_rgba(0,0,0,0.12)]">
                      <p className="mb-3 text-xs font-medium text-[var(--foreground)]/70">
                        Other sets in this series
                      </p>
                      <ul className="grid grid-cols-2 gap-1.5">
                        {otherSetsInSeries.map((setOption) => {
                          const params = new URLSearchParams();
                          params.set("set", setOption.code);
                          if (activeRarity) params.set("rarity", activeRarity);
                          if (activeSearch) params.set("search", activeSearch);
                          const href = `/cards?${params.toString()}`;
                          return (
                            <li key={setOption.code}>
                              <Link
                                href={href}
                                prefetch={false}
                                className="flex items-center justify-center rounded-md border border-[var(--foreground)]/15 p-1.5 transition hover:bg-[var(--foreground)]/6"
                                title={setOption.name}
                                aria-label={`View ${setOption.name}`}
                              >
                                <img
                                  src={setOption.logoSrc}
                                  alt={setOption.name}
                                  className="mx-auto h-7 w-auto max-w-[88px] object-contain"
                                  loading="lazy"
                                />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-8">
                  {groupedSetOptions.map((group) => (
                    <section key={group.seriesName}>
                      <h4 className="mb-3 text-[11px] font-semibold text-[var(--foreground)]/65">
                        {group.seriesName}
                      </h4>
                      <ul className="grid grid-cols-2 gap-1.5">
                        {group.options.map((setOption) => {
                          const params = new URLSearchParams();
                          params.set("set", setOption.code);
                          if (activeRarity) params.set("rarity", activeRarity);
                          if (activeSearch) params.set("search", activeSearch);
                          const href = `/cards?${params.toString()}`;
                          return (
                            <li key={setOption.code}>
                              <Link
                                href={href}
                                prefetch={false}
                                className="flex items-center justify-center rounded-md border border-[var(--foreground)]/15 p-1.5 transition hover:bg-[var(--foreground)]/6"
                                title={`${setOption.name}${setOption.releaseYear ? ` (${setOption.releaseYear})` : ""}`}
                                aria-label={`Filter by ${setOption.name}`}
                              >
                                <img
                                  src={setOption.logoSrc}
                                  alt={setOption.name}
                                  className="mx-auto h-7 w-auto max-w-[88px] object-contain"
                                  loading="lazy"
                                />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </aside>
          <section className="flex min-h-0 flex-col lg:pr-1">
            <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <form method="get" action="/cards" className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {activeSet ? <input type="hidden" name="set" value={activeSet} /> : null}
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
                {activeSet || activeRarity || activeSearch ? " (filtered)" : ""}
              </p>
            </div>
            <div className="scrollbar-hide min-h-0 overflow-y-auto">
              <CardGrid cards={cardsForGrid} />
            </div>
            <div className="mt-4 shrink-0 flex items-center justify-between gap-3 text-sm">
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
