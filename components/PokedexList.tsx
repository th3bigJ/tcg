"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

import type { PokemonFilterOption } from "@/lib/cardsFilterOptionsServer";
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";

export function PokedexList({
  pokemon,
  collectedDexIds,
}: {
  pokemon: PokemonFilterOption[];
  collectedDexIds: Set<number>;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pokemon;
    return pokemon.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.nationalDexNumber).includes(q),
    );
  }, [pokemon, search]);

  return (
    <>
      <div className="relative mb-4 flex min-h-11 items-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 shrink-0 -translate-y-1/2 text-[var(--foreground)]/45"
          aria-hidden
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          placeholder="Search Pokémon…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search Pokémon"
          className="min-h-11 w-full rounded-xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 py-2 pl-10 pr-3 text-base leading-normal text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 focus:border-[var(--foreground)]/30 focus:outline-none md:text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[var(--foreground)]/50">No Pokémon match "{search}"</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((item) => {
            const collected = collectedDexIds.has(item.nationalDexNumber);
            return (
              <li key={item.nationalDexNumber}>
                <Link
                  href={`/pokedex/${item.nationalDexNumber}`}
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
      )}
    </>
  );
}
