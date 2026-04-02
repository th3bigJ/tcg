import { cache } from "react";

import { resolvePokemonMediaURL } from "@/lib/media";
import type { PokemonJsonEntry } from "@/lib/staticDataTypes";
import { getAllSets } from "@/lib/staticCards";

export type SetFilterOption = {
  code: string;
  name: string;
  logoSrc: string;
  symbolSrc: string;
  releaseYear: number | null;
  seriesName: string;
  cardCountOfficial: number | null;
  cardCountTotal: number | null;
};

export type PokemonFilterOption = {
  nationalDexNumber: number;
  name: string;
  imageUrl: string;
  generation: number;
};

const getAllSetFilterOptions = cache(async function getAllSetFilterOptions(): Promise<SetFilterOption[]> {
  "use cache";
  const results: SetFilterOption[] = [];

  for (const s of getAllSets()) {
    const code = s.code ?? s.tcgdexId;
    if (!code || !s.logoSrc) continue;

    const releaseYear = s.releaseDate
      ? new Date(s.releaseDate).getUTCFullYear()
      : null;

    results.push({
      code,
      name: s.name || code,
      logoSrc: s.logoSrc,
      symbolSrc: s.symbolSrc ?? "",
      releaseYear: releaseYear !== null && Number.isFinite(releaseYear) ? releaseYear : null,
      seriesName: s.seriesName ?? "Uncategorized",
      cardCountOfficial: s.cardCountOfficial ?? null,
      cardCountTotal: s.cardCountTotal ?? null,
    });
  }

  return results.sort((a, b) => {
    const yearA = a.releaseYear ?? 0;
    const yearB = b.releaseYear ?? 0;
    if (yearA !== yearB) return yearB - yearA;
    return a.name.localeCompare(b.name);
  });
});

export async function getCachedSetFilterOptions(setCodes: string[]): Promise<SetFilterOption[]> {
  if (setCodes.length === 0) return [];

  const codeSet = new Set(setCodes);
  const options = await getAllSetFilterOptions();
  return options.filter((option) => codeSet.has(option.code));
}

const getAllPokemonFilterOptions = cache(async function getAllPokemonFilterOptions(): Promise<PokemonFilterOption[]> {
  "use cache";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../data/pokemon.json") as PokemonJsonEntry[];
  return raw.map((p) => ({
    nationalDexNumber: p.nationalDexNumber,
    name: p.name,
    generation: p.generation,
    imageUrl: /^https?:\/\//i.test(p.imageUrl)
      ? p.imageUrl
      : resolvePokemonMediaURL(p.imageUrl),
  }));
});

export function getCachedPokemonFilterOptions(): Promise<PokemonFilterOption[]> {
  return getAllPokemonFilterOptions();
}
