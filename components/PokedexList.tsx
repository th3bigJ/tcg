"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { PokemonFilterOption } from "@/lib/cardsFilterOptionsServer";
import { normalizePokemonImageSrc } from "@/lib/pokemonImageUrl";

const GENERATION_META: Record<number, { label: string; dexRange: string }> = {
  1: { label: "Generation I", dexRange: "#001-#151" },
  2: { label: "Generation II", dexRange: "#152-#251" },
  3: { label: "Generation III", dexRange: "#252-#386" },
  4: { label: "Generation IV", dexRange: "#387-#493" },
  5: { label: "Generation V", dexRange: "#494-#649" },
  6: { label: "Generation VI", dexRange: "#650-#721" },
  7: { label: "Generation VII", dexRange: "#722-#809" },
  8: { label: "Generation VIII", dexRange: "#810-#905" },
  9: { label: "Generation IX", dexRange: "#906-#1025" },
};

export function PokedexList({
  pokemon,
  collectedDexIds,
  customerLoggedIn = false,
  missingOnly = false,
  searchSelectionParams = {},
}: {
  pokemon: PokemonFilterOption[];
  collectedDexIds: Set<number>;
  customerLoggedIn?: boolean;
  missingOnly?: boolean;
  searchSelectionParams?: Record<string, string>;
}) {
  const filtered = useMemo(() => {
    if (missingOnly && customerLoggedIn) {
      return pokemon.filter((p) => !collectedDexIds.has(p.nationalDexNumber));
    }
    return pokemon;
  }, [pokemon, missingOnly, customerLoggedIn, collectedDexIds]);
  const [collapsedGenerations, setCollapsedGenerations] = useState<Record<number, boolean>>({});

  const grouped = useMemo(() => {
    const byGeneration = new Map<number, PokemonFilterOption[]>();
    for (const entry of filtered) {
      const generation = entry.generation;
      const items = byGeneration.get(generation);
      if (items) items.push(entry);
      else byGeneration.set(generation, [entry]);
    }

    return [...byGeneration.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([generation, items]) => {
        const totalCount = items.length;
        const collectedCount = items.reduce(
          (count, item) => count + (collectedDexIds.has(item.nationalDexNumber) ? 1 : 0),
          0,
        );
        return {
          generation,
          items,
          totalCount,
          collectedCount,
          meta: GENERATION_META[generation] ?? {
            label: `Generation ${generation}`,
            dexRange: "",
          },
        };
      });
  }, [filtered, collectedDexIds]);

  function toggleGeneration(generation: number) {
    setCollapsedGenerations((current) => ({
      ...current,
      [generation]: !current[generation],
    }));
  }

  return (
    <>
      {filtered.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[var(--foreground)]/50">
          {missingOnly && customerLoggedIn
            ? "You've collected at least one card for every Pokémon in the list."
            : "No Pokémon found."}
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => {
            const isCollapsed = Boolean(collapsedGenerations[group.generation]);
            const progressLabel = customerLoggedIn
              ? `${group.collectedCount} of ${group.totalCount} collected`
              : `${group.totalCount} Pokémon`;

            return (
              <section
                key={`generation-${group.generation}`}
                className="overflow-hidden rounded-2xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/3"
              >
                <button
                  type="button"
                  onClick={() => toggleGeneration(group.generation)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[var(--foreground)]/6"
                  aria-expanded={!isCollapsed}
                  aria-controls={`pokedex-generation-${group.generation}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold sm:text-base">{group.meta.label}</h2>
                      <span className="rounded-full border border-[var(--foreground)]/12 px-2 py-0.5 text-[10px] text-[var(--foreground)]/65 sm:text-[11px]">
                        {group.meta.dexRange}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--foreground)]/60">{progressLabel}</p>
                  </div>
                  <span
                    className={`shrink-0 text-[var(--foreground)]/60 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                    aria-hidden="true"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>
                {!isCollapsed ? (
                  <div id={`pokedex-generation-${group.generation}`} className="border-t border-[var(--foreground)]/8 px-3 py-3 sm:px-4">
                    <ul className="grid grid-cols-3 gap-3 sm:gap-4">
                      {group.items.map((item) => {
                        const collected = collectedDexIds.has(item.nationalDexNumber);
                        return (
                          <li key={`generation-${group.generation}-pokemon-${item.nationalDexNumber}`}>
                            <Link
                              href={buildSearchHref(searchSelectionParams, item.nationalDexNumber)}
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
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function buildSearchHref(searchSelectionParams: Record<string, string>, nationalDexNumber: number) {
  const params = new URLSearchParams(searchSelectionParams);
  const returnTo = params.get("return_to");
  params.delete("return_to");
  params.set("pokemon", String(nationalDexNumber));
  params.delete("set");
  params.delete("take");
  const qs = params.toString();
  if (returnTo && returnTo.startsWith("/")) {
    const url = new URL(returnTo, "http://local");
    const targetParams = new URLSearchParams(url.search);
    targetParams.set("pokemon", String(nationalDexNumber));
    targetParams.delete("set");
    targetParams.delete("take");
    return `${url.pathname}${targetParams.toString() ? `?${targetParams.toString()}` : ""}`;
  }
  return `/search${qs ? `?${qs}` : ""}`;
}
