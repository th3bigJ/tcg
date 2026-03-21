"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type SetFilterOption = {
  code: string;
  name: string;
  logoSrc: string;
  releaseYear: number | null;
  seriesName: string;
};

type PokemonFilterOption = {
  nationalDexNumber: number;
  name: string;
  imageUrl: string;
};

type CardFiltersPanelProps = {
  sets: SetFilterOption[];
  pokemon: PokemonFilterOption[];
  activeSet: string;
  activePokemonDex: string;
  activeRarity: string;
  activeSearch: string;
  onSelection?: () => void;
};

function normalizeName(value: string): string {
  return value
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function normalizePokemonImageSrc(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  if (/\.[a-z0-9]+$/i.test(trimmed)) {
    return `/api/pokemon-media/file/${encodeURIComponent(trimmed)}`;
  }
  return `/${trimmed}`;
}

function buildCardsHref(params: {
  set?: string;
  pokemon?: string;
  rarity: string;
  search: string;
}): string {
  const query = new URLSearchParams();
  if (params.set) query.set("set", params.set);
  if (params.pokemon) query.set("pokemon", params.pokemon);
  if (params.rarity) query.set("rarity", params.rarity);
  if (params.search) query.set("search", params.search);
  const value = query.toString();
  return value ? `/cards?${value}` : "/cards";
}

export function CardFiltersPanel({
  sets,
  pokemon,
  activeSet,
  activePokemonDex,
  activeRarity,
  activeSearch,
  onSelection,
}: CardFiltersPanelProps) {
  const [activeTab, setActiveTab] = useState<"sets" | "pokemon">("sets");
  const [setSearchText, setSetSearchText] = useState("");
  const [pokemonSearchText, setPokemonSearchText] = useState("");

  const filteredSets = useMemo(() => {
    const q = setSearchText.trim().toLocaleLowerCase();
    if (!q) return sets;
    return sets.filter((option) => option.name.toLocaleLowerCase().includes(q));
  }, [setSearchText, sets]);

  const groupedSetOptions = useMemo(() => {
    const groups = new Map<string, SetFilterOption[]>();
    for (const option of filteredSets) {
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
        if (a.oldestYear !== b.oldestYear) return b.oldestYear - a.oldestYear;
        return a.seriesName.localeCompare(b.seriesName);
      });
  }, [filteredSets]);

  const filteredPokemon = useMemo(() => {
    const q = pokemonSearchText.trim().toLocaleLowerCase();
    if (!q) return pokemon;
    return pokemon.filter((item) => normalizeName(item.name).toLocaleLowerCase().includes(q));
  }, [pokemon, pokemonSearchText]);

  return (
    <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-md border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("sets")}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
            activeTab === "sets"
              ? "bg-[var(--foreground)]/16 text-[var(--foreground)]"
              : "text-[var(--foreground)]/75 hover:bg-[var(--foreground)]/8"
          }`}
        >
          Sets
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("pokemon")}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
            activeTab === "pokemon"
              ? "bg-[var(--foreground)]/16 text-[var(--foreground)]"
              : "text-[var(--foreground)]/75 hover:bg-[var(--foreground)]/8"
          }`}
        >
          Pokemon
        </button>
      </div>

      {activeTab === "sets" ? (
        <div>
          <input
            type="search"
            value={setSearchText}
            onChange={(event) => setSetSearchText(event.currentTarget.value)}
            placeholder="Search set name"
            aria-label="Search set name"
            className="mb-3 w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-1.5 text-xs shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] outline-none transition focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/20"
          />
          <div className="flex flex-col gap-8">
            {groupedSetOptions.map((group) => (
              <section key={group.seriesName}>
                <h4 className="mb-3 text-[11px] font-semibold text-[var(--foreground)]/65">
                  {group.seriesName}
                </h4>
                <ul className="grid grid-cols-2 gap-1.5">
                  {group.options.map((setOption) => (
                    <li key={setOption.code}>
                      <Link
                        href={buildCardsHref({
                          set: setOption.code,
                          pokemon: undefined,
                          rarity: activeRarity,
                          search: activeSearch,
                        })}
                        prefetch={false}
                        onClick={onSelection}
                        className={`flex items-center justify-center rounded-md border p-1.5 transition ${
                          setOption.code === activeSet
                            ? "border-[var(--foreground)]/40 bg-[var(--foreground)]/12"
                            : "border-[var(--foreground)]/15 hover:bg-[var(--foreground)]/6"
                        }`}
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
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <input
            type="search"
            value={pokemonSearchText}
            onChange={(event) => setPokemonSearchText(event.currentTarget.value)}
            placeholder="Search Pokemon name"
            aria-label="Search Pokemon name"
            className="mb-3 w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-1.5 text-xs shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] outline-none transition focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/20"
          />
          <ul className="grid grid-cols-3 gap-2">
            {filteredPokemon.map((item) => {
              const dexValue = String(item.nationalDexNumber);
              const isActive = dexValue === activePokemonDex;
              return (
                <li key={item.nationalDexNumber}>
                  <Link
                    href={buildCardsHref({
                      set: undefined,
                      pokemon: dexValue,
                      rarity: activeRarity,
                      search: activeSearch,
                    })}
                    prefetch={false}
                    onClick={onSelection}
                    className={`flex flex-col items-center justify-center gap-1 rounded-md border p-1.5 text-center transition ${
                      isActive
                        ? "border-[var(--foreground)]/40 bg-[var(--foreground)]/12"
                        : "border-[var(--foreground)]/15 hover:bg-[var(--foreground)]/6"
                    }`}
                    title={normalizeName(item.name)}
                    aria-label={`Filter by ${normalizeName(item.name)}`}
                  >
                    <img
                      src={normalizePokemonImageSrc(item.imageUrl)}
                      alt={normalizeName(item.name)}
                      className="h-12 w-12 object-contain"
                      loading="lazy"
                    />
                    <span className="line-clamp-1 text-[10px] text-[var(--foreground)]/80">
                      {normalizeName(item.name)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
