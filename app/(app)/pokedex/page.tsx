import { PokedexList } from "@/components/PokedexList";
import { getCurrentCustomer } from "@/lib/auth";
import { getCachedPokemonFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";

const TOTAL_POKEMON_COUNT = 1025;

type PokedexIndexPageProps = {
  searchParams?: Promise<Record<string, string>>;
};

export default async function PokedexIndexPage({ searchParams }: PokedexIndexPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const customer = await getCurrentCustomer();
  const missingOnly = resolvedSearchParams.missing_only === "1";
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
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-0">
        <header className="mb-2 flex shrink-0 items-center border-b border-[var(--foreground)]/10 pb-1.5">
          <div className="min-w-0">
            <h1 className="flex min-h-9 items-center leading-none text-base font-semibold">Select a Pokemon</h1>
            {customer ? (
              <p className="text-xs text-[var(--foreground)]/70">
                {collectedDexIds.size} of {TOTAL_POKEMON_COUNT} Pokemon collected
              </p>
            ) : null}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1.5rem,var(--bottom-nav-offset))]">
          <PokedexList
            pokemon={pokemon}
            collectedDexIds={collectedDexIds}
            customerLoggedIn={Boolean(customer)}
            missingOnly={missingOnly}
            searchSelectionParams={resolvedSearchParams}
          />
        </div>
      </main>
    </div>
  );
}
