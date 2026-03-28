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
};

export function getCachedSetFilterOptions(setCodes: string[]): SetFilterOption[] {
  if (setCodes.length === 0) return [];

  const codeSet = new Set(setCodes);
  const results: SetFilterOption[] = [];

  for (const s of getAllSets()) {
    const code = s.code ?? s.tcgdexId;
    if (!code || !codeSet.has(code)) continue;
    if (!s.logoSrc) continue;

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
}

export function getCachedPokemonFilterOptions(): Promise<PokemonFilterOption[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../data/pokemon.json") as PokemonJsonEntry[];
  const options: PokemonFilterOption[] = raw.map((p) => ({
    nationalDexNumber: p.nationalDexNumber,
    name: p.name,
    imageUrl: /^https?:\/\//i.test(p.imageUrl)
      ? p.imageUrl
      : resolvePokemonMediaURL(p.imageUrl),
  }));
  return Promise.resolve(options);
}
