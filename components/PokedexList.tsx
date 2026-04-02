"use client";

import { useDeferredValue, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";

import type { PokemonFilterOption } from "@/lib/cardsFilterOptionsServer";
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";
import { buildPokedexDetailHref } from "@/lib/persistedFilters";
import { useProgressiveRender } from "@/lib/useProgressiveRender";

export function PokedexList({
  pokemon,
  collectedDexIds,
  customerLoggedIn = false,
  missingOnly = false,
}: {
  pokemon: PokemonFilterOption[];
  collectedDexIds: Set<number>;
  customerLoggedIn?: boolean;
  missingOnly?: boolean;
}) {
  const filtered = useMemo(() => {
    if (missingOnly && customerLoggedIn) {
      return pokemon.filter((p) => !collectedDexIds.has(p.nationalDexNumber));
    }
    return pokemon;
  }, [pokemon, missingOnly, customerLoggedIn, collectedDexIds]);
  const deferredFiltered = useDeferredValue(filtered);
  const { hasMore, sentinelRef, visibleItems } = useProgressiveRender(deferredFiltered, {
    initialCount: 120,
    step: 120,
  });

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <>
      {deferredFiltered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[var(--foreground)]/50">
          {missingOnly && customerLoggedIn
            ? "You've collected at least one card for every Pokémon in the list."
            : "No Pokémon found."}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-3 sm:gap-4">
            {visibleItems.map((item) => {
              const collected = collectedDexIds.has(item.nationalDexNumber);
              return (
                <li key={item.nationalDexNumber}>
                  <Link
                    href={mounted ? buildPokedexDetailHref(item.nationalDexNumber) : `/pokedex/${item.nationalDexNumber}`}
                    prefetch={false}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center shadow-sm transition active:opacity-90 ${
                      collected
                        ? "border-[var(--accent)]/30 bg-[var(--accent)]/8 hover:bg-[var(--accent)]/12"
                        : "border-[var(--foreground)]/12 bg-[var(--foreground)]/5 hover:border-[var(--foreground)]/22 hover:bg-[var(--foreground)]/8"
                    }`}
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
              );
            })}
          </ul>
          {hasMore ? <div ref={sentinelRef} aria-hidden className="h-8 w-full" /> : null}
        </>
      )}
    </>
  );
}
