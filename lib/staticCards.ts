/**
 * Static data access layer — reads card catalog from local JSON files generated
 * by scripts/exportCardJson.ts. Zero DB queries, zero network calls.
 *
 * Committed stubs: `data/pokemon/{sets,series,pokemon}.json` (empty arrays) so CI/Docker resolve modules.
 * For a full catalog locally or on a host with a populated volume, run `npm run r2:download-static-data`
 * and add per-set files under `data/pokemon/cards/` (gitignored). Those files are bundled when present
 * via `import.meta.glob` so Turbopack does not need a dynamic `require()` per set.
 */

import type { CardJsonEntry, PokemonJsonEntry, SeriesJsonEntry, SetJsonEntry } from "@/lib/staticDataTypes";
import { resolveMediaURL } from "@/lib/media";
import { buildScrydexPrefixCandidates } from "@/lib/scrydexPrefixCandidatesForSet";
import { getSinglesCatalogSetKey } from "@/lib/singlesCatalogSetKey";

import pokemonDexRaw from "../data/pokemon/pokemon.json";
import seriesRaw from "../data/pokemon/series.json";
import setsRaw from "../data/pokemon/sets.json";

export type { CardJsonEntry, SeriesJsonEntry, SetJsonEntry };

type CardJsonModule = CardJsonEntry[] | { default: CardJsonEntry[] };

/** Turbopack exposes `import.meta.glob`; Next's `ImportMeta` typings omit it. */
function loadCardJsonGlob(): Record<string, CardJsonModule> {
  const meta = import.meta as ImportMeta & { glob?: (p: string, o: { eager: true }) => Record<string, CardJsonModule> };
  if (typeof meta.glob !== "function") return {};
  return meta.glob("../data/pokemon/cards/*.json", { eager: true });
}

const cardJsonModules = loadCardJsonGlob();

function normalizeJsonModule<T>(mod: CardJsonEntry[] | { default: CardJsonEntry[] }): CardJsonEntry[] {
  return Array.isArray(mod) ? mod : mod.default;
}

function cardGlobPathForSet(setCode: string): string | undefined {
  const suffix = `/${setCode}.json`;
  return Object.keys(cardJsonModules).find((k) => k.endsWith(suffix));
}

// ─── Sets ─────────────────────────────────────────────────────────────────────

let _sets: SetJsonEntry[] | null = null;

export function getAllSets(): SetJsonEntry[] {
  if (_sets) return _sets;
  const raw = setsRaw as SetJsonEntry[];
  _sets = raw.map((s) => ({
    ...s,
    logoSrc: resolveMediaURL(s.logoSrc) || s.logoSrc,
    symbolSrc: s.symbolSrc ? resolveMediaURL(s.symbolSrc) || s.symbolSrc : s.symbolSrc,
  }));
  return _sets;
}

/** Resolve a set row by catalog `setKey` or any Scrydex `listPrefix` / alias (e.g. `me1` vs `me01`). */
export function getSetByCode(code: string): SetJsonEntry | null {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  const all = getAllSets();
  for (const s of all) {
    const k = getSinglesCatalogSetKey(s);
    if (k && k.toLowerCase() === c) return s;
  }
  for (const s of all) {
    for (const p of buildScrydexPrefixCandidates(s)) {
      if (p.toLowerCase() === c) return s;
    }
  }
  return null;
}

export function getAllSetCodes(): string[] {
  return getAllSets().map((s) => getSinglesCatalogSetKey(s)).filter((c): c is string => Boolean(c));
}

// ─── Series ───────────────────────────────────────────────────────────────────

let _series: SeriesJsonEntry[] | null = null;

export function getAllSeries(): SeriesJsonEntry[] {
  if (_series) return _series;
  _series = seriesRaw as SeriesJsonEntry[];
  return _series;
}

// ─── Pokémon dex (search / filters) ──────────────────────────────────────────

let _pokemonDex: PokemonJsonEntry[] | null = null;

export function getAllPokemonDexEntries(): PokemonJsonEntry[] {
  if (_pokemonDex) return _pokemonDex;
  _pokemonDex = pokemonDexRaw as PokemonJsonEntry[];
  return _pokemonDex;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

const _cardsBySet = new Map<string, CardJsonEntry[]>();

export function getCardsBySet(setCode: string): CardJsonEntry[] {
  if (_cardsBySet.has(setCode)) return _cardsBySet.get(setCode)!;
  const path = cardGlobPathForSet(setCode);
  if (!path) {
    _cardsBySet.set(setCode, []);
    return [];
  }
  const raw = normalizeJsonModule(cardJsonModules[path]!);
  const cards = raw.map((c) => ({
    ...c,
    imageLowSrc: resolveMediaURL(c.imageLowSrc) || c.imageLowSrc,
    imageHighSrc: c.imageHighSrc ? resolveMediaURL(c.imageHighSrc) || c.imageHighSrc : c.imageHighSrc,
  }));
  _cardsBySet.set(setCode, cards);
  return cards;
}

let _allCards: CardJsonEntry[] | null = null;

export function getAllCards(): CardJsonEntry[] {
  if (_allCards) return _allCards;
  const codes = getAllSetCodes();
  _allCards = codes.flatMap(getCardsBySet);
  return _allCards;
}

export function getCardByMasterCardId(id: string): CardJsonEntry | null {
  for (const code of getAllSetCodes()) {
    const cards = getCardsBySet(code);
    const found = cards.find((c) => c.masterCardId === id);
    if (found) return found;
  }
  return null;
}

/** Map URL/query set params (legacy tcg codes or catalog keys) to the canonical catalog key. */
export function normalizeSetCodeFromUrlParam(param: string): string {
  const t = param.trim();
  if (!t) return "";
  const row = getSetByCode(t);
  return row ? (getSinglesCatalogSetKey(row) ?? t) : t;
}
