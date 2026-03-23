import Link from "next/link";

import { getCachedPokemonFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMaps";

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
      <ul className="grid grid-cols-3 gap-3 sm:gap-4">
        {pokemon.map((item) => (
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
  );
}
