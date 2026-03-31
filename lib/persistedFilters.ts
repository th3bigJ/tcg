const STORAGE_KEY = "tcg-filters";
export const PERSISTED_FILTERS_UPDATED_EVENT = "tcg:persisted-filters-updated";

export type SortOrder =
  | "price-desc"
  | "price-asc"
  | "release-desc"
  | "release-asc"
  | "number-desc"
  | "number-asc";

export const DEFAULT_SORT: SortOrder = "price-desc";

export type PersistedFilters = {
  rarity?: string;
  energy?: string;
  excludeCommonUncommon?: boolean;
  excludeCollected?: boolean;
  category?: string;
  missingOnly?: boolean;
  sort?: SortOrder;
};

export function readPersistedFilters(): PersistedFilters {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) return JSON.parse(raw) as PersistedFilters;
  } catch {}
  return {};
}

export function persistFilters(next: PersistedFilters): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(PERSISTED_FILTERS_UPDATED_EVENT, { detail: next }));
    }
  } catch {}
}

export function buildPokedexDetailHref(dexNumber: number): string {
  const f = readPersistedFilters();
  const p = new URLSearchParams();
  if (f.energy) p.set("energy", f.energy);
  if (f.rarity) p.set("rarity", f.rarity);
  if (f.excludeCommonUncommon) p.set("exclude_cu", "1");
  if (f.excludeCollected) p.set("exclude_owned", "1");
  if (f.category) p.set("category", f.category);
  const s = p.toString();
  return s ? `/pokedex/${dexNumber}?${s}` : `/pokedex/${dexNumber}`;
}

export function sortCards<T extends { setReleaseDate?: string | null; cardNumber?: string | null }>(
  cards: T[],
  sort: SortOrder,
  getPriceFn?: (card: T) => number,
): T[] {
  const arr = [...cards];
  switch (sort) {
    case "price-desc":
      return arr.sort((a, b) => (getPriceFn?.(b) ?? 0) - (getPriceFn?.(a) ?? 0));
    case "price-asc":
      return arr.sort((a, b) => (getPriceFn?.(a) ?? 0) - (getPriceFn?.(b) ?? 0));
    case "release-desc":
      return arr.sort((a, b) => (b.setReleaseDate ?? "").localeCompare(a.setReleaseDate ?? ""));
    case "release-asc":
      return arr.sort((a, b) => (a.setReleaseDate ?? "").localeCompare(b.setReleaseDate ?? ""));
    case "number-desc":
      return arr.sort((a, b) =>
        (b.cardNumber ?? "").localeCompare(a.cardNumber ?? "", undefined, { numeric: true }),
      );
    case "number-asc":
      return arr.sort((a, b) =>
        (a.cardNumber ?? "").localeCompare(b.cardNumber ?? "", undefined, { numeric: true }),
      );
    default:
      return arr;
  }
}
