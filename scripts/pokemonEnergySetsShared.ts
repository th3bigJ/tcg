/**
 * Shared utilities for Scarlet & Violet Energy (SVE) and Mega Evolution Energy (MEE).
 * Data: TCGdex (full card lists). Images: Pokémon TCG API official scans when available (SVE 001–016),
 * otherwise Limitless CDN (SM + LG). MEE is not in the public Pokémon TCG API yet — Limitless only.
 */

import type { CardJsonEntry } from "../lib/staticDataTypes";

type TcgdexSetSummary = {
  id: string;
  name: string;
  releaseDate?: string;
  cardCount?: { official?: number; total?: number };
  cards?: Array<{ id: string; localId: string; name: string }>;
};

type PtgCardImages = {
  small?: string;
  large?: string;
  name?: string;
};

const PTG_CARD_BASE = "https://api.pokemontcg.io/v2/cards";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchTcgdexSet(tcgdxSetId: string): Promise<TcgdexSetSummary> {
  return fetchJson<TcgdexSetSummary>(`https://api.tcgdex.net/v2/en/sets/${tcgdxSetId}`);
}

/** Pokémon TCG API uses sve-1 … sve-16 (no zero padding). */
export async function fetchPtgSveCard(localIdPadded: string): Promise<PtgCardImages | null> {
  const n = Number.parseInt(localIdPadded, 10);
  if (!Number.isFinite(n) || n < 1 || n > 16) return null;
  const res = await fetch(`${PTG_CARD_BASE}/sve-${n}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { name?: string; images?: { small?: string; large?: string } } };
  const data = body.data;
  if (!data) return null;
  return {
    name: data.name,
    small: data.images?.small,
    large: data.images?.large,
  };
}

function padLocalId(localId: string | undefined): string {
  const value = (localId ?? "").trim();
  if (!value) return "";
  return /^\d+$/u.test(value) ? value.padStart(3, "0") : value;
}

function limitlessEnergyImage(setAbbrevUpper: string, paddedLocalId: string, size: "SM" | "LG" | "MD"): string {
  return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${setAbbrevUpper}/${setAbbrevUpper}_${paddedLocalId}_R_EN_${size}.png`;
}

const TYPE_WORD_TO_LABEL: Record<string, string> = {
  grass: "Grass",
  fire: "Fire",
  water: "Water",
  lightning: "Lightning",
  psychic: "Psychic",
  fighting: "Fighting",
  darkness: "Darkness",
  metal: "Metal",
  dragon: "Dragon",
  fairy: "Fairy",
  colorless: "Colorless",
};

/** Derive element type from "Grass Energy" / "Basic Grass Energy". */
function elementTypesFromEnergyName(name: string): string[] {
  const trimmed = name.trim();
  const basic = trimmed.match(/^Basic\s+(\w+)\s+Energy$/iu);
  if (basic) {
    const key = basic[1].toLowerCase();
    const label = TYPE_WORD_TO_LABEL[key] ?? basic[1][0]!.toUpperCase() + basic[1].slice(1).toLowerCase();
    return [label];
  }
  const plain = trimmed.match(/^(\w+)\s+Energy$/iu);
  if (plain) {
    const key = plain[1].toLowerCase();
    const label = TYPE_WORD_TO_LABEL[key] ?? plain[1][0]!.toUpperCase() + plain[1].slice(1).toLowerCase();
    return [label];
  }
  return [];
}

function buildFullDisplayName(name: string, cardNumber: string, setName: string): string {
  return `${name} ${cardNumber} ${setName}`.trim();
}

type TcgdexCardDetail = {
  id: string;
  localId?: string;
  name: string;
  rarity?: string | null;
  illustrator?: string | null;
};

type BuildEnergyCardArgs = {
  detail: TcgdexCardDetail;
  setKey: string;
  setName: string;
  officialCount: number;
  abbrevUpper: string;
  masterCardId: string;
  ptg?: PtgCardImages | null;
};

function buildEnergyCardJson(args: BuildEnergyCardArgs): CardJsonEntry {
  const { detail, setKey, setName, officialCount, abbrevUpper, masterCardId, ptg } = args;
  const localId = padLocalId(detail.localId);
  const cardNumber = `${localId}/${String(officialCount)}`;

  const displayName = ptg?.name?.trim() || detail.name;
  const elementTypes = elementTypesFromEnergyName(displayName);

  const lowFromLimitless = limitlessEnergyImage(abbrevUpper, localId, "SM");
  const highFromLimitless = limitlessEnergyImage(abbrevUpper, localId, "LG");

  const imageLowSrc = ptg?.small?.trim() || lowFromLimitless;
  const imageHighSrc = ptg?.large?.trim() || highFromLimitless;

  return {
    masterCardId,
    externalId: null,
    localId,
    setCode: setKey,
    cardNumber,
    cardName: displayName,
    fullDisplayName: buildFullDisplayName(displayName, cardNumber, setName),
    rarity: detail.rarity ?? null,
    category: "Energy",
    hp: null,
    elementTypes: elementTypes.length ? elementTypes : [],
    dexIds: null,
    trainerType: null,
    energyType: "Basic",
    regulationMark: null,
    artist: detail.illustrator ?? null,
    imageLowSrc,
    imageHighSrc,
    subtype: "Basic",
    weakness: null,
    resistance: null,
    retreatCost: null,
    flavorText: null,
    pricingVariants: null,
  };
}

export async function buildEnergySetCards(options: {
  tcgdxSetId: string;
  setKey: string;
  abbrevUpper: string;
  fetchPtg?: (paddedLocalId: string) => Promise<PtgCardImages | null>;
  assignMasterId: (paddedLocalId: string, index: number) => string;
}): Promise<CardJsonEntry[]> {
  const summary = await fetchTcgdexSet(options.tcgdxSetId);
  const official = summary.cardCount?.official ?? summary.cards?.length ?? 0;
  if (!summary.cards?.length) throw new Error(`TCGdex set ${options.tcgdxSetId} returned no cards`);

  const cards: CardJsonEntry[] = [];
  let index = 0;
  for (const row of summary.cards) {
    const detail = await fetchJson<TcgdexCardDetail>(`https://api.tcgdex.net/v2/en/cards/${row.id}`);
    const localId = padLocalId(detail.localId);
    const ptg = options.fetchPtg ? await options.fetchPtg(localId) : null;
    const masterCardId = options.assignMasterId(localId, index++);
    cards.push(
      buildEnergyCardJson({
        detail,
        setKey: options.setKey,
        setName: summary.name,
        officialCount: official,
        abbrevUpper: options.abbrevUpper,
        masterCardId,
        ptg,
      }),
    );
  }

  cards.sort((a, b) => b.cardNumber.localeCompare(a.cardNumber, undefined, { numeric: true }));
  return cards;
}
