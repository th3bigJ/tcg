import { getCachedPokemonFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";
import { PokedexList } from "@/components/PokedexList";

const TOTAL_POKEMON_COUNT = 1025;

export default async function PokedexPage() {
  const [pokemon, customer] = await Promise.all([getCachedPokemonFilterOptions(), getCurrentCustomer()]);
  const collectionEntries = customer ? await fetchCollectionCardEntries(customer.id) : [];
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
  const collectedPokemonCount = collectedDexIds.size;

  return (
    <main className="min-h-full bg-[var(--background)] px-4 pb-[max(1.5rem,var(--bottom-nav-offset))] pt-4 text-[var(--foreground)]">
      <h1 className="text-xl font-semibold tracking-tight">Pokédex</h1>
      {customer ? (
        <p className="mb-4 mt-1 text-sm text-[var(--foreground)]/70">
          {collectedPokemonCount} of {TOTAL_POKEMON_COUNT} Pokemon collected
        </p>
      ) : (
        <div className="mb-4" aria-hidden />
      )}
      <PokedexList pokemon={pokemon} collectedDexIds={collectedDexIds} />
    </main>
  );
}
