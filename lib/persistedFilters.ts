const STORAGE_KEY = "tcg-filters";
export const PERSISTED_FILTERS_UPDATED_EVENT = "tcg:persisted-filters-updated";
export type PersistedFilterScope =
  | "search"
  | "pokedex"
  | "expansions"
  | "collect"
  | "wishlist"
  | "friends"
  | "friends-collection"
  | "friends-wishlist";

export type SortOrder =
  | "random"
  | "price-desc"
  | "price-asc"
  | "change-desc"
  | "change-asc"
  | "release-desc"
  | "release-asc"
  | "number-desc"
  | "number-asc";

export const DEFAULT_SORT: SortOrder = "price-desc";
export const SEARCH_DEFAULT_SORT: SortOrder = "random";

type PersistedFilters = {
  rarity?: string;
  energy?: string;
  excludeCommonUncommon?: boolean;
  excludeCollected?: boolean;
  duplicatesOnly?: boolean;
  category?: string;
  missingOnly?: boolean;
  groupBySet?: boolean;
  showOwnedOnly?: boolean;
  sort?: SortOrder;
};

function storageKeyForScope(scope?: PersistedFilterScope): string {
  return scope ? `${STORAGE_KEY}:${scope}` : STORAGE_KEY;
}

export function readPersistedFilters(scope?: PersistedFilterScope): PersistedFilters {
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(storageKeyForScope(scope)) : null;
    if (raw) return JSON.parse(raw) as PersistedFilters;
  } catch {}
  return {};
}

export function persistFilters(next: PersistedFilters, scope?: PersistedFilterScope): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKeyForScope(scope), JSON.stringify(next));
      window.dispatchEvent(
        new CustomEvent(PERSISTED_FILTERS_UPDATED_EVENT, { detail: { filters: next, scope } }),
      );
    }
  } catch {}
}
