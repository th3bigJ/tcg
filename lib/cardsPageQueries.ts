import type { CardJsonEntry } from "@/lib/staticCards";
import { getCardsBySet, getAllSets } from "@/lib/staticCards";
import {
  getDefaultCardOrder,
  getFilterFacets,
  getPokemonDexIndex,
  getCardMapById,
} from "@/lib/staticCardIndex";

export type CardsPageCardEntry = {
  /** Payload `master-card-list` document id (for collection / wishlist APIs). */
  masterCardId?: string;
  /** TCGdex card id — used for market price API; omit when unknown. */
  externalId?: string;
  /** Backup id used when `externalId` misses in cache/API lookups. */
  legacyExternalId?: string;
  set: string;
  /** Payload `sets.slug` (kebab-case), when the populated set includes it. */
  setSlug?: string;
  setName?: string;
  /** Payload `sets.tcgdexId` when the populated set includes it. */
  setTcgdexId?: string;
  /** Payload `sets.cardCountOfficial` when the populated set includes it. */
  setCardCountOfficial?: number;
  setLogoSrc?: string;
  setSymbolSrc?: string;
  /** Set release date from Payload (ISO), for display in card modal. */
  setReleaseDate?: string;
  cardNumber?: string;
  filename: string;
  src: string;
  lowSrc: string;
  highSrc: string;
  rarity: string;
  cardName: string;
  category?: string;
  stage?: string;
  hp?: number;
  elementTypes?: string[];
  dexIds?: number[];
  artist?: string;
  regulationMark?: string;
};

/** Legacy default page size (used only to interpret old `?page=` bookmarks). */
export const CARDS_PER_PAGE = 80;
/** First paint on /cards — how many cards to fetch before "Load more". */
export const CARDS_INITIAL_TAKE = 42;
/** Each "Load more" adds this many additional cards (URL `take` grows by this). */
export const CARDS_LOAD_MORE_STEP = 42;
/** Upper bound for a single /cards request (Payload `in` query + payload size). */
export const CARDS_TAKE_MAX = 5000;

function createSeededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seededRandom() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffleRowsWithSeed<T>(rows: readonly T[], seed: string): T[] {
  const shuffled = [...rows];
  const random = createSeededRandom(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/**
 * How many cards to load from the start (accumulating slice). Uses `take` when set;
 * falls back to legacy `page` (≈80 cards per page) then default initial take.
 */
export function resolveCardsTakeFromParams(
  rawTake: string | undefined,
  rawPage: string | undefined,
): number {
  const takeParsed = Number.parseInt(rawTake ?? "", 10);
  if (Number.isFinite(takeParsed) && takeParsed > 0) {
    return Math.min(CARDS_TAKE_MAX, takeParsed);
  }
  const pageParsed = Number.parseInt(rawPage ?? "", 10);
  if (Number.isFinite(pageParsed) && pageParsed > 1) {
    return Math.min(CARDS_TAKE_MAX, pageParsed * CARDS_PER_PAGE);
  }
  return CARDS_INITIAL_TAKE;
}

// ─── Card entry conversion ────────────────────────────────────────────────────

function normalizeTcgdexLocalId(localId: string | null | undefined): string | null {
  if (!localId) return null;
  const trimmed = localId.trim();
  if (!trimmed) return null;
  if (/^\d+$/u.test(trimmed)) return trimmed.padStart(3, "0");
  return trimmed;
}

function cardJsonEntryToCardsPageEntry(
  card: CardJsonEntry,
  setMeta: ReturnType<typeof getAllSets>[number] | undefined,
): CardsPageCardEntry | null {
  if (!card.imageLowSrc) return null;

  const lowUrl = card.imageLowSrc;
  const highUrl = card.imageHighSrc ?? lowUrl;
  const cleanPath = lowUrl.split("?")[0];
  const filename = cleanPath.split("/").pop();
  if (!filename) return null;

  const localIdNormalized = normalizeTcgdexLocalId(card.localId);
  const tcgdexStored = card.tcgdex_id?.trim() || undefined;
  const extStored = card.externalId?.trim() || undefined;
  const derivedFromSetAndLocal =
    card.setTcgdexId && localIdNormalized
      ? `${card.setTcgdexId}-${localIdNormalized}`
      : undefined;

  const ext = tcgdexStored ?? extStored ?? derivedFromSetAndLocal;
  const legacyExternalId =
    tcgdexStored !== undefined ? extStored ?? derivedFromSetAndLocal : derivedFromSetAndLocal;

  return {
    ...(card.masterCardId ? { masterCardId: card.masterCardId } : {}),
    ...(ext ? { externalId: ext } : {}),
    ...(legacyExternalId ? { legacyExternalId } : {}),
    set: card.setCode,
    setSlug: setMeta?.slug || undefined,
    setName: setMeta?.name || undefined,
    setTcgdexId: card.setTcgdexId ?? undefined,
    setCardCountOfficial:
      setMeta?.cardCountOfficial != null && setMeta.cardCountOfficial >= 0
        ? Math.floor(setMeta.cardCountOfficial)
        : undefined,
    setLogoSrc: setMeta?.logoSrc || undefined,
    setSymbolSrc: setMeta?.symbolSrc || undefined,
    setReleaseDate: setMeta?.releaseDate ?? undefined,
    cardNumber: card.cardNumber || undefined,
    filename,
    src: lowUrl,
    lowSrc: lowUrl,
    highSrc: highUrl,
    rarity: card.rarity ?? "",
    cardName: card.cardName ?? "",
    category: card.category ?? undefined,
    stage: card.stage ?? undefined,
    hp: card.hp ?? undefined,
    elementTypes: card.elementTypes ?? undefined,
    dexIds: card.dexIds ?? undefined,
    artist: card.artist ?? undefined,
    regulationMark: card.regulationMark ?? undefined,
  };
}

// ─── Set meta lookup ──────────────────────────────────────────────────────────

function buildSetMetaMap(): Map<string, ReturnType<typeof getAllSets>[number]> {
  const map = new Map<string, ReturnType<typeof getAllSets>[number]>();
  for (const s of getAllSets()) {
    if (s.code) map.set(s.code, s);
    if (s.tcgdexId) map.set(s.tcgdexId, s);
  }
  return map;
}

let _setMetaMap: Map<string, ReturnType<typeof getAllSets>[number]> | null = null;
function getSetMetaMap() {
  if (!_setMetaMap) _setMetaMap = buildSetMetaMap();
  return _setMetaMap;
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

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

const EXCLUDED_BASIC_RARITIES = new Set(["common", "uncommon"]);

function normalizeCardNumberSearchValue(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/\d+/gu, (digits) => String(Number.parseInt(digits, 10)));
}

function cardMatchesSearchQuery(card: CardJsonEntry, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  const normalizedQuery = normalizeCardNumberSearchValue(rawQuery);

  const searchableValues: string[] = [
    card.cardNumber ?? "",
    card.cardName ?? "",
    card.fullDisplayName ?? "",
    card.artist ?? "",
    ...(Array.isArray(card.elementTypes) ? card.elementTypes : []).map((value) => String(value ?? "")),
    ...(Array.isArray(card.dexIds) ? card.dexIds : []).map((value) => String(value ?? "")),
  ];

  return searchableValues.some((value) => {
    const normalizedValue = value.toLocaleLowerCase();
    if (normalizedValue.includes(query)) return true;
    return normalizeCardNumberSearchValue(value).includes(normalizedQuery);
  });
}

function cardMatchesFilters(
  card: CardJsonEntry,
  params: {
    activeSet: string;
    activeRarity: string;
    activeSearch: string;
    activeArtist: string;
    excludeCommonUncommon: boolean;
    categoryQueryVariants: string[];
  },
): boolean {
  if (params.activeSet && card.setCode !== params.activeSet) return false;

  if (
    params.activeRarity &&
    (card.rarity ?? "").trim() !== params.activeRarity
  )
    return false;

  if (params.excludeCommonUncommon) {
    const lr = (card.rarity ?? "").trim().toLocaleLowerCase();
    if (EXCLUDED_BASIC_RARITIES.has(lr)) return false;
  }

  if (params.categoryQueryVariants.length > 0) {
    const cardCategory = (card.category ?? "").trim();
    if (!params.categoryQueryVariants.includes(cardCategory)) return false;
  }

  if (!cardMatchesSearchQuery(card, params.activeSearch)) return false;

  if (
    params.activeArtist &&
    (card.artist ?? "").trim() !== params.activeArtist
  )
    return false;

  return true;
}

/** Map URL `category` param to canonical label and DB values (handles legacy spellings). */
export function resolveCardsCategoryFilter(
  selectedFromUrl: string,
  displayValues: string[],
  matchGroups: Record<string, string[]>,
): { canonicalLabel: string; queryVariants: string[] } {
  const trimmed = selectedFromUrl.trim();
  if (!trimmed) return { canonicalLabel: "", queryVariants: [] };

  if (displayValues.includes(trimmed)) {
    return { canonicalLabel: trimmed, queryVariants: matchGroups[trimmed] ?? [trimmed] };
  }

  for (const label of displayValues) {
    const variants = matchGroups[label] ?? [];
    if (variants.includes(trimmed)) {
      return { canonicalLabel: label, queryVariants: variants };
    }
  }

  return { canonicalLabel: "", queryVariants: [] };
}

// ─── Cached filter facets (now synchronous from static data) ─────────────────

export function getCachedFilterFacets() {
  return Promise.resolve(getFilterFacets());
}

// ─── Set market value ─────────────────────────────────────────────────────────

/**
 * Sum the lowest raw GBP price per card for the given set.
 * Reads from the R2 pricing JSON if available, falls back to Payload DB.
 */
export async function fetchSetMarketValue(setCode: string): Promise<number | null> {
  try {
    const { getPricingForSet } = await import("@/lib/r2Pricing");
    const pricing = await getPricingForSet(setCode);
    if (!pricing) return null;

    let total = 0;
    let counted = 0;

    for (const entry of Object.values(pricing)) {
      const scrydex = entry.scrydex;
      if (!scrydex || typeof scrydex !== "object" || Array.isArray(scrydex)) continue;
      let lowest = Infinity;
      for (const v of Object.values(scrydex as Record<string, unknown>)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const raw = (v as Record<string, unknown>).raw;
          if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < lowest) {
            lowest = raw;
          }
        }
      }
      if (lowest !== Infinity) {
        total += lowest;
        counted++;
      }
    }

    return counted > 0 ? total : null;
  } catch {
    return null;
  }
}

/**
 * Sum the lowest raw GBP price for cards in a set that are not already owned.
 * Uses the same pricing source as {@link fetchSetMarketValue}.
 */
export async function fetchSetCompletionValue(
  setCode: string,
  cards: CardsPageCardEntry[],
  ownedMasterCardIds: Set<string>,
): Promise<{ missingCount: number; totalValueGbp: number } | null> {
  try {
    const { getPricingForSet, getPricingForCard } = await import("@/lib/r2Pricing");
    const pricing = await getPricingForSet(setCode);
    if (!pricing) return null;

    let total = 0;
    let counted = 0;
    let missingCount = 0;
    const seen = new Set<string>();

    for (const card of cards) {
      const masterCardId = card.masterCardId?.trim() ?? "";
      if (masterCardId && ownedMasterCardIds.has(masterCardId)) continue;

      const externalId = card.externalId?.trim() ?? "";
      const uniqueKey = masterCardId || externalId || `${card.set}/${card.filename}`;
      if (!externalId || seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);
      missingCount++;

      const fallback = card.legacyExternalId?.trim() ? [card.legacyExternalId.trim()] : undefined;
      const entry = getPricingForCard(pricing, externalId, fallback);
      const scrydex = entry?.scrydex;
      if (!scrydex || typeof scrydex !== "object" || Array.isArray(scrydex)) continue;

      let lowest = Infinity;
      for (const v of Object.values(scrydex as Record<string, unknown>)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const raw = (v as Record<string, unknown>).raw;
          if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < lowest) {
            lowest = raw;
          }
        }
      }

      if (lowest !== Infinity) {
        total += lowest;
        counted++;
      }
    }

    return missingCount > 0 ? { missingCount, totalValueGbp: counted > 0 ? total : 0 } : null;
  } catch {
    return null;
  }
}

/**
 * Sum the lowest raw GBP price for a list of cards spanning multiple sets.
 * Returns total market value and (if ownedMasterCardIds provided) missing value.
 */
export async function fetchCardsMarketValue(
  cards: CardsPageCardEntry[],
  ownedMasterCardIds?: Set<string>,
): Promise<{ totalValueGbp: number; missingValueGbp: number; missingCount: number } | null> {
  try {
    const { getPricingForSet, getPricingForCard } = await import("@/lib/r2Pricing");

    const cardsBySet = new Map<string, CardsPageCardEntry[]>();
    for (const card of cards) {
      const set = card.set?.trim() ?? "";
      if (!set) continue;
      const list = cardsBySet.get(set) ?? [];
      list.push(card);
      cardsBySet.set(set, list);
    }

    const pricingMaps = await Promise.all(
      [...cardsBySet.keys()].map(async (setCode) => [setCode, await getPricingForSet(setCode)] as const),
    );
    const pricingBySet = new Map(pricingMaps);

    let totalValueGbp = 0;
    let missingValueGbp = 0;
    let missingCount = 0;
    const seen = new Set<string>();

    for (const card of cards) {
      const masterCardId = card.masterCardId?.trim() ?? "";
      const externalId = card.externalId?.trim() ?? "";
      const uniqueKey = masterCardId || externalId;
      if (!uniqueKey || seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      const pricing = pricingBySet.get(card.set?.trim() ?? "");
      if (!pricing || !externalId) continue;

      const fallback = card.legacyExternalId?.trim() ? [card.legacyExternalId.trim()] : undefined;
      const entry = getPricingForCard(pricing, externalId, fallback);
      const scrydex = entry?.scrydex;
      if (!scrydex || typeof scrydex !== "object" || Array.isArray(scrydex)) continue;

      let lowest = Infinity;
      for (const v of Object.values(scrydex as Record<string, unknown>)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const raw = (v as Record<string, unknown>).raw;
          if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < lowest) {
            lowest = raw;
          }
        }
      }
      if (lowest === Infinity) continue;

      totalValueGbp += lowest;
      const isOwned = ownedMasterCardIds && masterCardId && ownedMasterCardIds.has(masterCardId);
      if (!isOwned) {
        missingValueGbp += lowest;
        missingCount++;
      }
    }

    return { totalValueGbp, missingValueGbp, missingCount };
  } catch {
    return null;
  }
}

// ─── Shuffled set order (call once server-side, pass to fetchMasterCardsPage) ─

export function generateShuffledSetOrder(): string[] {
  const orderedRows = getDefaultCardOrder();
  const seen = new Set<string>();
  const setCodes: string[] = [];
  for (const row of orderedRows) {
    if (!seen.has(row.setCode)) { seen.add(row.setCode); setCodes.push(row.setCode); }
  }
  for (let i = setCodes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [setCodes[i], setCodes[j]] = [setCodes[j]!, setCodes[i]!];
  }
  return setCodes;
}

// ─── Main card page fetch ─────────────────────────────────────────────────────

export async function fetchMasterCardsPage(params: {
  activeSet: string;
  activeRarity: string;
  activeSearch: string;
  activeArtist: string;
  activePokemonDex: number | null;
  activePokemonName: string | null;
  excludeCommonUncommon: boolean;
  categoryQueryVariants: string[];
  page: number;
  perPage: number;
  /** Pre-shuffled set order for the default unfiltered view. Generated once server-side to avoid hydration mismatches. */
  setOrder?: string[];
  /** Stable seed for a fully randomized card feed that persists across "load more". */
  randomSeed?: string;
}): Promise<{ entries: CardsPageCardEntry[]; totalDocs: number }> {
  const pageSize = Math.min(CARDS_TAKE_MAX, Math.max(1, Math.floor(params.perPage)));
  const setMetaMap = getSetMetaMap();

  function toEntry(card: CardJsonEntry): CardsPageCardEntry | null {
    return cardJsonEntryToCardsPageEntry(card, setMetaMap.get(card.setCode));
  }

  const orderedRows = getDefaultCardOrder();
  const orderRank = new Map<string, number>();
  orderedRows.forEach((row, index) => orderRank.set(row.id, index));

  // ── Pokemon dex filter path ────────────────────────────────────────────────
  if (params.activePokemonDex !== null) {
    const dexIndex = getPokemonDexIndex();
    const candidates = dexIndex[String(params.activePokemonDex)] ?? [];

    const searchQuery = params.activeSearch.trim().toLocaleLowerCase();
    const categoryFilterKey =
      params.categoryQueryVariants.length > 0
        ? categoryFacetKey(params.categoryQueryVariants[0])
        : "";

    const filteredCandidates = candidates.filter((entry) => {
      if (params.activeSet && entry.setCode !== params.activeSet) return false;
      if (params.activeRarity && entry.rarity !== params.activeRarity) return false;
      if (searchQuery && !entry.cardNameLower.includes(searchQuery)) return false;
      if (params.excludeCommonUncommon) {
        const lr = entry.rarity.trim().toLocaleLowerCase();
        if (EXCLUDED_BASIC_RARITIES.has(lr)) return false;
      }
      if (categoryFilterKey && entry.categoryKey !== categoryFilterKey) return false;
      return true;
    });

    filteredCandidates.sort((a, b) => {
      const ra = orderRank.get(a.id);
      const rb = orderRank.get(b.id);
      if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
      if (ra === undefined && rb !== undefined) return 1;
      if (rb === undefined && ra !== undefined) return -1;
      return a.id.localeCompare(b.id);
    });

    const totalDocs = filteredCandidates.length;
    const startIndex = (params.page - 1) * pageSize;
    const pageSlice = filteredCandidates.slice(startIndex, startIndex + pageSize);
    if (pageSlice.length === 0) return { entries: [], totalDocs };

    const cardMap = getCardMapById();
    const entries = pageSlice
      .map((c) => cardMap.get(c.id))
      .filter((c): c is CardJsonEntry => Boolean(c))
      .map(toEntry)
      .filter((e): e is CardsPageCardEntry => e !== null);

    return { entries, totalDocs };
  }

  // ── Default unfiltered path (interleave one card per set, round-robin) ─────
  const isDefaultUnfiltered =
    !params.activeSet &&
    !params.activeRarity &&
    !params.activeSearch &&
    !params.activeArtist &&
    !params.excludeCommonUncommon &&
    params.categoryQueryVariants.length === 0;

  if (isDefaultUnfiltered) {
    if (params.randomSeed) {
      const shuffledRows = shuffleRowsWithSeed(orderedRows, params.randomSeed);
      const totalDocs = shuffledRows.length;
      const startIndex = (params.page - 1) * pageSize;
      const pageRows = shuffledRows.slice(startIndex, startIndex + pageSize);
      if (pageRows.length === 0) return { entries: [], totalDocs };

      const cardMap = getCardMapById();
      const entries = pageRows
        .map((row) => cardMap.get(row.id))
        .filter((c): c is CardJsonEntry => Boolean(c))
        .map(toEntry)
        .filter((e): e is CardsPageCardEntry => e !== null);

      return { entries, totalDocs };
    }

    // Group rows by set, preserving within-set order (card number descending from getDefaultCardOrder)
    const setQueues = new Map<string, typeof orderedRows>();
    for (const row of orderedRows) {
      let q = setQueues.get(row.setCode);
      if (!q) { q = []; setQueues.set(row.setCode, q); }
      q.push(row);
    }
    // Use caller-supplied set order (pre-shuffled server-side) or fall back to natural order
    const setCodes = params.setOrder ?? [...setQueues.keys()];
    // All cards from one set before moving to the next (shuffled set order)
    const interleaved: typeof orderedRows = [];
    for (const code of setCodes) {
      const q = setQueues.get(code)!;
      for (const row of q) interleaved.push(row);
    }

    const totalDocs = interleaved.length;
    const startIndex = (params.page - 1) * pageSize;
    const pageRows = interleaved.slice(startIndex, startIndex + pageSize);
    if (pageRows.length === 0) return { entries: [], totalDocs };

    const cardMap = getCardMapById();
    const entries = pageRows
      .map((row) => cardMap.get(row.id))
      .filter((c): c is CardJsonEntry => Boolean(c))
      .map(toEntry)
      .filter((e): e is CardsPageCardEntry => e !== null);

    return { entries, totalDocs };
  }

  // ── Filtered path ──────────────────────────────────────────────────────────
  // If filtering by set, only load that set's cards; otherwise scan all ordered rows.
  let filteredIds: string[];

  if (params.activeSet) {
    const setCards = getCardsBySet(params.activeSet);
    const matched = setCards.filter((c) =>
      cardMatchesFilters(c, params)
    );
    filteredIds = matched.map((c) => c.masterCardId);
  } else {
    // Scan ordered rows, preserving sort order
    const cardMap = getCardMapById();
    filteredIds = orderedRows
      .map((row) => {
        const card = cardMap.get(row.id);
        if (!card) return null;
        return cardMatchesFilters(card, params) ? row.id : null;
      })
      .filter((id): id is string => id !== null);
  }

  const searchQuery = params.activeSearch.trim();
  const releaseSortedFilteredIds = searchQuery
    ? [...filteredIds].sort((a, b) => {
        const cardA = getCardMapById().get(a);
        const cardB = getCardMapById().get(b);
        const releaseA = cardA ? setMetaMap.get(cardA.setCode)?.releaseDate ?? "" : "";
        const releaseB = cardB ? setMetaMap.get(cardB.setCode)?.releaseDate ?? "" : "";
        const releaseCompare = releaseB.localeCompare(releaseA);
        if (releaseCompare !== 0) return releaseCompare;
        const rankA = orderRank.get(a);
        const rankB = orderRank.get(b);
        if (rankA !== undefined && rankB !== undefined && rankA !== rankB) return rankA - rankB;
        if (rankA === undefined && rankB !== undefined) return 1;
        if (rankB === undefined && rankA !== undefined) return -1;
        return a.localeCompare(b);
      })
    : filteredIds;

  const orderedFilteredIds = params.randomSeed && !searchQuery
    ? shuffleRowsWithSeed(releaseSortedFilteredIds, params.randomSeed)
    : releaseSortedFilteredIds;

  const totalDocs = orderedFilteredIds.length;
  const startIndex = (params.page - 1) * pageSize;
  const pageIds = orderedFilteredIds.slice(startIndex, startIndex + pageSize);
  if (pageIds.length === 0) return { entries: [], totalDocs };

  const cardMap = getCardMapById();
  const entries = pageIds
    .map((id) => cardMap.get(id))
    .filter((c): c is CardJsonEntry => Boolean(c))
    .map(toEntry)
    .filter((e): e is CardsPageCardEntry => e !== null);

  return { entries, totalDocs };
}

// ─── National dex lookup ──────────────────────────────────────────────────────

const BY_NATIONAL_DEX_MAX_CARDS = 500;

export async function fetchMasterCardsByNationalDexIds(
  dexIds: number[],
  options?: { limit?: number },
): Promise<CardsPageCardEntry[]> {
  const uniqueDex = [...new Set(dexIds.filter((n) => Number.isFinite(n) && n > 0))];
  if (uniqueDex.length === 0) return [];

  const limitCap = Math.min(
    typeof options?.limit === "number" && options.limit > 0
      ? options.limit
      : BY_NATIONAL_DEX_MAX_CARDS,
    BY_NATIONAL_DEX_MAX_CARDS,
  );

  const dexIndex = getPokemonDexIndex();
  const idSet = new Set<string>();
  for (const dex of uniqueDex) {
    const list = dexIndex[String(dex)] ?? [];
    for (const entry of list) idSet.add(entry.id);
  }

  if (idSet.size === 0) return [];

  const orderedRows = getDefaultCardOrder();
  const orderRank = new Map<string, number>();
  orderedRows.forEach((row, index) => orderRank.set(row.id, index));

  const allIds = [...idSet].sort((a, b) => {
    const ra = orderRank.get(a);
    const rb = orderRank.get(b);
    if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
    if (ra === undefined && rb !== undefined) return 1;
    if (rb === undefined && ra !== undefined) return -1;
    return a.localeCompare(b);
  });

  const pageIds = allIds.slice(0, limitCap);
  const cardMap = getCardMapById();
  const setMetaMap = getSetMetaMap();

  return pageIds
    .map((id) => cardMap.get(id))
    .filter((c): c is CardJsonEntry => Boolean(c))
    .map((c) => cardJsonEntryToCardsPageEntry(c, setMetaMap.get(c.setCode)))
    .filter((e): e is CardsPageCardEntry => e !== null);
}
