import Link from "next/link";
import { CardGrid } from "@/components/CardGrid";
import { resolveMediaURL } from "@/lib/media";

type CardEntry = {
  set: string;
  filename: string;
  src: string;
  lowSrc: string;
  highSrc: string;
  rarity: string;
  illustrator: string;
  cardName: string;
};

type ImageRelation = {
  url?: string | null;
  filename?: string | null;
};

type SetFilterOption = {
  code: string;
  name: string;
  logoSrc: string;
};

const CARDS_PER_PAGE = 120;

const isImageRelation = (value: unknown): value is ImageRelation =>
  Boolean(value) && typeof value === "object";

async function getLowResCards(): Promise<CardEntry[]> {
  const payloadConfig = (await import("../../../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const entries: CardEntry[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await payload.find({
      collection: "master-card-list",
      depth: 1,
      limit: 1000,
      page,
      overrideAccess: true,
      select: {
        set: true,
        imageLow: true,
        imageHigh: true,
        rarity: true,
        artist: true,
        cardName: true,
      },
      where: {
        imageLow: {
          exists: true,
        },
      },
    });

    for (const doc of result.docs) {
      const relation = isImageRelation(doc.imageLow) ? doc.imageLow : null;
      const lowUrl = typeof relation?.url === "string" ? relation.url : "";
      if (!lowUrl) continue;
      const highRelation = isImageRelation(doc.imageHigh) ? doc.imageHigh : null;
      const highUrl = typeof highRelation?.url === "string" ? highRelation.url : lowUrl;

      const cleanPath = lowUrl.split("?")[0];
      const filename =
        (typeof relation?.filename === "string" && relation.filename) ||
        cleanPath.split("/").pop();
      if (!filename) continue;

      const set =
        typeof doc.set === "object" &&
        doc.set &&
        "code" in doc.set &&
        typeof doc.set.code === "string"
          ? doc.set.code
          : "unknown";

      entries.push({
        set,
        filename,
        src: resolveMediaURL(lowUrl),
        lowSrc: resolveMediaURL(lowUrl),
        highSrc: resolveMediaURL(highUrl),
        rarity: typeof doc.rarity === "string" ? doc.rarity.trim() : "",
        illustrator: typeof doc.artist === "string" ? doc.artist.trim() : "",
        cardName: typeof doc.cardName === "string" ? doc.cardName.trim() : "",
      });
    }

    hasNextPage = result.hasNextPage;
    page += 1;
  }

  return entries.sort((a, b) => {
    if (a.set !== b.set) return a.set.localeCompare(b.set);
    return a.filename.localeCompare(b.filename, undefined, { numeric: true });
  });
}

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
      if (!code || !imageUrl) return null;
      return {
        code,
        name,
        logoSrc: resolveMediaURL(imageUrl),
      };
    })
    .filter((option): option is SetFilterOption => Boolean(option))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type CardsPageProps = {
  searchParams?: Promise<{
    page?: string;
    set?: string;
    rarity?: string;
    illustrator?: string;
    search?: string;
  }>;
};

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const cards = await getLowResCards();
  const selectedSet = (resolvedSearchParams.set ?? "").trim();
  const selectedRarity = (resolvedSearchParams.rarity ?? "").trim();
  const selectedIllustrator = (resolvedSearchParams.illustrator ?? "").trim();
  const selectedSearch = (resolvedSearchParams.search ?? "").trim();
  const availableSetCodes = [...new Set(cards.map((card) => card.set))].filter(
    (setCode) => setCode && setCode !== "unknown",
  );
  const rarityOptions = [...new Set(cards.map((card) => card.rarity))].filter(Boolean).sort();
  const illustratorOptions = [...new Set(cards.map((card) => card.illustrator))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const setFilterOptions = await getSetFilterOptions(availableSetCodes);
  const hasSelectedSet = setFilterOptions.some((option) => option.code === selectedSet);
  const hasSelectedRarity = rarityOptions.includes(selectedRarity);
  const hasSelectedIllustrator = illustratorOptions.includes(selectedIllustrator);
  const activeSet = hasSelectedSet ? selectedSet : "";
  const activeRarity = hasSelectedRarity ? selectedRarity : "";
  const activeIllustrator = hasSelectedIllustrator ? selectedIllustrator : "";
  const activeSearch = selectedSearch;
  const activeSearchLower = activeSearch.toLocaleLowerCase();

  const filteredCards = cards.filter((card) => {
    if (activeSet && card.set !== activeSet) return false;
    if (activeRarity && card.rarity !== activeRarity) return false;
    if (activeIllustrator && card.illustrator !== activeIllustrator) return false;
    if (activeSearchLower && !card.cardName.toLocaleLowerCase().includes(activeSearchLower)) {
      return false;
    }
    return true;
  });
  const rawPage = Number.parseInt(resolvedSearchParams.page ?? "1", 10);
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / CARDS_PER_PAGE));
  const currentPage = Number.isFinite(rawPage)
    ? Math.min(Math.max(rawPage, 1), totalPages)
    : 1;
  const startIndex = (currentPage - 1) * CARDS_PER_PAGE;
  const paginatedCards = filteredCards.slice(startIndex, startIndex + CARDS_PER_PAGE);
  const showingFrom = filteredCards.length === 0 ? 0 : startIndex + 1;
  const showingTo = Math.min(startIndex + paginatedCards.length, filteredCards.length);
  const createCardsHref = (page: number) => {
    const params = new URLSearchParams();
    if (activeSet) params.set("set", activeSet);
    if (activeRarity) params.set("rarity", activeRarity);
    if (activeIllustrator) params.set("illustrator", activeIllustrator);
    if (activeSearch) params.set("search", activeSearch);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/cards?${query}` : "/cards";
  };
  const previousHref = createCardsHref(currentPage - 1);
  const nextHref = createCardsHref(currentPage + 1);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="shrink-0 border-b border-[var(--foreground)]/10 bg-[var(--background)] px-4 py-4">
        <div className="flex w-full items-center justify-between">
          <h1 className="text-xl font-semibold">Low-res card gallery</h1>
          <Link
            href="/"
            className="text-sm underline underline-offset-2 hover:no-underline"
          >
            ← Home
          </Link>
        </div>
      </header>
      <main className="min-h-0 flex-1 w-full px-4 py-6">
        <div className="grid h-full items-start gap-4 lg:grid-cols-[20%_minmax(0,1fr)]">
          <aside className="rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-2 lg:min-h-0 lg:overflow-y-auto">
            <h2 className="mb-3 text-sm font-semibold">Filters</h2>
            <form method="get" action="/cards" className="mb-3 space-y-2 rounded-md border border-[var(--foreground)]/10 p-2">
              <div>
                <label htmlFor="search" className="mb-1 block text-xs font-medium text-[var(--foreground)]/80">
                  Search card name
                </label>
                <input
                  id="search"
                  name="search"
                  type="search"
                  defaultValue={activeSearch}
                  placeholder="e.g. Charizard"
                  className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label htmlFor="rarity" className="mb-1 block text-xs font-medium text-[var(--foreground)]/80">
                  Rarity
                </label>
                <select
                  id="rarity"
                  name="rarity"
                  defaultValue={activeRarity}
                  className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-1.5 text-xs"
                >
                  <option value="">All rarities</option>
                  {rarityOptions.map((rarity) => (
                    <option key={rarity} value={rarity}>
                      {rarity}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="illustrator"
                  className="mb-1 block text-xs font-medium text-[var(--foreground)]/80"
                >
                  Illustrator
                </label>
                <select
                  id="illustrator"
                  name="illustrator"
                  defaultValue={activeIllustrator}
                  className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-1.5 text-xs"
                >
                  <option value="">All illustrators</option>
                  {illustratorOptions.map((illustrator) => (
                    <option key={illustrator} value={illustrator}>
                      {illustrator}
                    </option>
                  ))}
                </select>
              </div>
              {activeSet ? <input type="hidden" name="set" value={activeSet} /> : null}
              <button
                type="submit"
                className="w-full rounded-md border border-[var(--foreground)]/20 px-2 py-1.5 text-xs font-medium hover:bg-[var(--foreground)]/5"
              >
                Apply filters
              </button>
              <Link
                href="/cards"
                className="block text-center text-xs text-[var(--foreground)]/70 underline underline-offset-2 hover:no-underline"
              >
                Clear all filters
              </Link>
            </form>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/70">
              Set
            </h3>
            <div className="space-y-2">
              <Link
                href={
                  (() => {
                    const params = new URLSearchParams();
                    if (activeRarity) params.set("rarity", activeRarity);
                    if (activeIllustrator) params.set("illustrator", activeIllustrator);
                    if (activeSearch) params.set("search", activeSearch);
                    const query = params.toString();
                    return query ? `/cards?${query}` : "/cards";
                  })()
                }
                className={`flex items-center justify-center rounded-md border px-2 py-1.5 text-xs transition hover:bg-[var(--foreground)]/5 ${
                  activeSet
                    ? "border-[var(--foreground)]/15"
                    : "border-[var(--foreground)]/30 bg-[var(--foreground)]/10 font-semibold"
                }`}
              >
                All sets
              </Link>
              <ul className="grid grid-cols-2 gap-1.5">
                {setFilterOptions.map((setOption) => {
                  const isActive = activeSet === setOption.code;
                  const params = new URLSearchParams();
                  params.set("set", setOption.code);
                  if (activeRarity) params.set("rarity", activeRarity);
                  if (activeIllustrator) params.set("illustrator", activeIllustrator);
                  if (activeSearch) params.set("search", activeSearch);
                  const href = `/cards?${params.toString()}`;
                  return (
                    <li key={setOption.code}>
                      <Link
                        href={href}
                        className={`flex items-center justify-center rounded-md border p-1.5 transition hover:bg-[var(--foreground)]/5 ${
                          isActive
                            ? "border-[var(--foreground)]/30 bg-[var(--foreground)]/10"
                            : "border-[var(--foreground)]/15"
                        }`}
                        title={setOption.name}
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
            </div>
          </aside>
          <section className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <p className="mb-6 text-sm text-[var(--foreground)]/70">
              Showing {showingFrom}-{showingTo} of {filteredCards.length} card
              {filteredCards.length === 1 ? "" : "s"} in {setFilterOptions.length} set
              {setFilterOptions.length === 1 ? "" : "s"}
              {activeSet || activeRarity || activeIllustrator || activeSearch ? " (filtered)" : ""}
            </p>
            <CardGrid cards={paginatedCards} />
            <div className="mt-6 flex items-center justify-between gap-3 text-sm">
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
