/**
 * In-memory indices built once from static card JSON.
 * Replaces the unstable_cache Payload queries for:
 *   - default card sort order
 *   - filter facets (set codes, rarities, categories)
 *   - pokemon dex index
 *
 * All functions are synchronous — no caching layer needed since
 * the source data is a static import that never changes at runtime.
 */

import type { CardJsonEntry } from "@/lib/staticDataTypes";
import { getAllCards, getAllSets, getAllSetCodes, getCardsBySet } from "@/lib/staticCards";

// ─── Shared helpers (mirrored from cardsPageQueries.ts) ───────────────────────

function getCardNumberRank(cardNumber: string | null | undefined): number {
  if (!cardNumber) return -1;
  const trimmed = cardNumber.trim();
  if (!trimmed) return -1;
  const beforeSlash = trimmed.split("/")[0] ?? trimmed;
  const match = beforeSlash.match(/\d+/);
  if (!match) return -1;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

function normalizeFilterValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function categoryFacetKey(value: string): string {
  const collapsed = normalizeFilterValue(value);
  if (!collapsed) return "";
  return collapsed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase();
}

function pickCanonicalCategoryLabel(values: ReadonlySet<string>): string {
  const list = [...values];
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  const hasNonAscii = (s: string): boolean =>
    [...s].some((ch) => {
      const cp = ch.codePointAt(0);
      return cp !== undefined && cp > 127;
    });
  list.sort((a, b) => a.localeCompare(b));
  const preferred = list.filter(hasNonAscii);
  if (preferred.length > 0) {
    preferred.sort((a, b) => b.length - a.length || a.localeCompare(b));
    return preferred[0];
  }
  return list[0];
}

// ─── Default card order ───────────────────────────────────────────────────────

export type DefaultCardOrderEntry = {
  id: string;
  setCode: string;
  setReleaseTimestamp: number;
  cardNumberRank: number;
};

let _defaultCardOrder: DefaultCardOrderEntry[] | null = null;

export function getDefaultCardOrder(): DefaultCardOrderEntry[] {
  if (_defaultCardOrder) return _defaultCardOrder;

  const sets = getAllSets();
  const setReleaseTimes = new Map<string, number>(
    sets.map((s) => {
      const code = s.code ?? s.tcgdexId ?? "";
      const time = s.releaseDate ? new Date(s.releaseDate).getTime() : 0;
      return [code, Number.isFinite(time) ? time : 0];
    })
  );

  const allCards = getAllCards();
  const rows: DefaultCardOrderEntry[] = allCards
    .filter((c) => c.imageLowSrc)
    .map((c) => ({
      id: c.masterCardId,
      setCode: c.setCode,
      setReleaseTimestamp: setReleaseTimes.get(c.setCode) ?? 0,
      cardNumberRank: getCardNumberRank(c.cardNumber),
    }));

  rows.sort((a, b) => {
    if (a.setReleaseTimestamp !== b.setReleaseTimestamp)
      return b.setReleaseTimestamp - a.setReleaseTimestamp;
    if (a.setCode !== b.setCode) return a.setCode.localeCompare(b.setCode);
    if (a.cardNumberRank !== b.cardNumberRank) return b.cardNumberRank - a.cardNumberRank;
    return b.id.localeCompare(a.id);
  });

  _defaultCardOrder = rows;
  return _defaultCardOrder;
}

// ─── Filter facets ────────────────────────────────────────────────────────────

export type FilterFacets = {
  setCodes: string[];
  rarityDisplayValues: string[];
  categoryDisplayValues: string[];
  categoryMatchGroups: Record<string, string[]>;
};

let _filterFacets: FilterFacets | null = null;

export function getFilterFacets(): FilterFacets {
  if (_filterFacets) return _filterFacets;

  const setCodes = getAllSetCodes();
  const rarityMap = new Map<string, string>();
  const categoryGroups = new Map<string, Set<string>>();

  for (const code of setCodes) {
    for (const card of getCardsBySet(code)) {
      if (!card.imageLowSrc) continue;

      if (card.rarity) {
        const display = normalizeFilterValue(card.rarity);
        if (display) {
          const key = display.toLocaleLowerCase();
          if (!rarityMap.has(key)) rarityMap.set(key, display);
        }
      }

      if (card.category) {
        const facetKey = categoryFacetKey(card.category);
        if (facetKey) {
          const variants = categoryGroups.get(facetKey) ?? new Set<string>();
          variants.add(card.category);
          categoryGroups.set(facetKey, variants);
        }
      }
    }
  }

  const categoryMatchGroups: Record<string, string[]> = {};
  const categoryDisplayValues: string[] = [];

  for (const variants of categoryGroups.values()) {
    const label = pickCanonicalCategoryLabel(variants);
    if (!label) continue;
    categoryDisplayValues.push(label);
    categoryMatchGroups[label] = [...variants];
  }

  categoryDisplayValues.sort((a, b) => a.localeCompare(b));

  _filterFacets = {
    setCodes,
    rarityDisplayValues: [...rarityMap.values()].sort((a, b) => a.localeCompare(b)),
    categoryDisplayValues,
    categoryMatchGroups,
  };
  return _filterFacets;
}

// ─── Pokemon dex index ────────────────────────────────────────────────────────

export type PokemonDexIndexEntry = {
  id: string;
  setCode: string;
  rarity: string;
  categoryKey: string;
  cardNameLower: string;
  cardNumberRank: number;
};

export type PokemonDexIndex = Record<string, PokemonDexIndexEntry[]>;

let _pokemonDexIndex: PokemonDexIndex | null = null;

export function getPokemonDexIndex(): PokemonDexIndex {
  if (_pokemonDexIndex) return _pokemonDexIndex;

  const index: PokemonDexIndex = {};

  for (const card of getAllCards()) {
    if (!card.imageLowSrc || !card.dexIds?.length) continue;

    const entry: PokemonDexIndexEntry = {
      id: card.masterCardId,
      setCode: card.setCode,
      rarity: card.rarity ?? "",
      categoryKey: card.category ? categoryFacetKey(card.category) : "",
      cardNameLower: card.cardName.trim().toLocaleLowerCase(),
      cardNumberRank: getCardNumberRank(card.cardNumber),
    };

    for (const dexId of card.dexIds) {
      const key = String(dexId);
      if (!index[key]) index[key] = [];
      index[key].push(entry);
    }
  }

  _pokemonDexIndex = index;
  return _pokemonDexIndex;
}

// ─── Card lookup by id ────────────────────────────────────────────────────────

let _cardById: Map<string, CardJsonEntry> | null = null;

export function getCardMapById(): Map<string, CardJsonEntry> {
  if (_cardById) return _cardById;
  const map = new Map<string, CardJsonEntry>();
  for (const card of getAllCards()) {
    map.set(card.masterCardId, card);
  }
  _cardById = map;
  return _cardById;
}
