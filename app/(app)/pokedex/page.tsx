import Link from "next/link";

import { getCachedPokemonFilterOptions } from "@/lib/cardsFilterOptionsServer";
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";

export default async function PokedexPage() {
  const pokemon = await getCachedPokemonFilterOptions();

  return (
    <main className="min-h-full bg-[var(--background)] px-4 pb-[max(1.5rem,var(--bottom-nav-offset))] pt-4 text-[var(--foreground)]">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Pokédex</h1>
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
