/**
 * Static data access layer — reads card catalog from local JSON files generated
 * by scripts/exportCardJson.ts. Zero DB queries, zero network calls.
 *
 * Files live at:
 *   data/sets.json
 *   data/series.json
 *   data/cards/{setCode}.json
 */

import type { CardJsonEntry, SeriesJsonEntry, SetJsonEntry } from "@/lib/staticDataTypes";
import { resolveMediaURL } from "@/lib/media";

export type { CardJsonEntry, SeriesJsonEntry, SetJsonEntry };

// ─── Sets ─────────────────────────────────────────────────────────────────────

let _sets: SetJsonEntry[] | null = null;

export function getAllSets(): SetJsonEntry[] {
  if (_sets) return _sets;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw = require("../data/sets.json") as SetJsonEntry[];
  // Resolve image paths to full URLs at read time so consumers always get absolute URLs
  _sets = raw.map((s) => ({
    ...s,
    logoSrc: resolveMediaURL(s.logoSrc) || s.logoSrc,
    symbolSrc: s.symbolSrc ? resolveMediaURL(s.symbolSrc) || s.symbolSrc : s.symbolSrc,
  }));
  return _sets;
}

export function getSetByCode(code: string): SetJsonEntry | null {
  return getAllSets().find((s) => s.code === code || s.tcgdexId === code) ?? null;
}

export function getAllSetCodes(): string[] {
  return getAllSets().map((s) => s.code ?? s.tcgdexId).filter((c): c is string => Boolean(c));
}

// ─── Series ───────────────────────────────────────────────────────────────────

let _series: SeriesJsonEntry[] | null = null;

export function getAllSeries(): SeriesJsonEntry[] {
  if (_series) return _series;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _series = require("../data/series.json") as SeriesJsonEntry[];
  return _series;
}

// ─── Cards ────────────────────────────────────────────────────────────────────

const _cardsBySet = new Map<string, CardJsonEntry[]>();

export function getCardsBySet(setCode: string): CardJsonEntry[] {
  if (_cardsBySet.has(setCode)) return _cardsBySet.get(setCode)!;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require(`../data/cards/${setCode}.json`) as CardJsonEntry[];
    const cards = raw.map((c) => ({
      ...c,
      imageLowSrc: resolveMediaURL(c.imageLowSrc) || c.imageLowSrc,
      imageHighSrc: c.imageHighSrc ? resolveMediaURL(c.imageHighSrc) || c.imageHighSrc : c.imageHighSrc,
    }));
    _cardsBySet.set(setCode, cards);
    return cards;
  } catch {
    return [];
  }
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
