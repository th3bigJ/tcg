"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

import type { PokemonFilterOption } from "@/lib/cardsFilterOptionsServer";
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";

export function PokedexList({
  pokemon,
  collectedDexIds,
  customerLoggedIn = false,
}: {
  pokemon: PokemonFilterOption[];
  collectedDexIds: Set<number>;
  /** When true, show the “Missing only” filter (requires collection data). */
  customerLoggedIn?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = pokemon;
    if (missingOnly && customerLoggedIn) {
      list = list.filter((p) => !collectedDexIds.has(p.nationalDexNumber));
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.nationalDexNumber).includes(q),
    );
  }, [pokemon, search, missingOnly, customerLoggedIn, collectedDexIds]);

  return (
    <>
      <div className="mb-3 flex flex-col gap-2">
        <input
          type="search"
          placeholder="Search Pokémon…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search Pokémon"
          className="min-h-11 w-full rounded-xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 px-3 py-2 text-base leading-normal text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 focus:border-[var(--foreground)]/30 focus:outline-none md:text-sm"
        />
        {customerLoggedIn ? (
          <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setMissingOnly((v) => !v)}
              aria-pressed={missingOnly}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                missingOnly
                  ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/75 hover:border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/12 hover:text-[var(--foreground)]"
              }`}
            >
              Missing only
            </button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[var(--foreground)]/50">
          {missingOnly && customerLoggedIn && !search.trim()
            ? "You’ve collected at least one card for every Pokémon in the list."
            : `No Pokémon match "${search.trim() || "your filters"}"`}
        </p>
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
