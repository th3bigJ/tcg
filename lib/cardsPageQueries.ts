import { unstable_cache } from "next/cache";
import type { Where } from "payload";

import { resolveMediaURL } from "@/lib/media";
import { resolveCanonicalSetCodeFromSetRelation } from "@/lib/setCanonicalCode";

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
  /** Optional `V{n}` in Cardmarket singles product path (master card field). */
  cardmarketListingVersion?: number;
  setLogoSrc?: string;
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

type ImageRelation = {
  url?: string | null;
  filename?: string | null;
};

const isImageRelation = (value: unknown): value is ImageRelation =>
  Boolean(value) && typeof value === "object";

/** Legacy default page size (used only to interpret old `?page=` bookmarks). */
export const CARDS_PER_PAGE = 80;
/** First paint on /cards — how many cards to fetch before “Load more”. */
export const CARDS_INITIAL_TAKE = 30;
/** Each “Load more” adds this many additional cards (URL `take` grows by this). */
export const CARDS_LOAD_MORE_STEP = 30;
/** Upper bound for a single /cards request (Payload `in` query + payload size). */
export const CARDS_TAKE_MAX = 5000;

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

const FILTER_FACETS_CACHE_KEY = "master-card-list-filter-facets-v5";
const FILTER_FACETS_REVALIDATE_SEC = 300;
/** Bumped when dex index shape changes; v5 stores tuple rows to stay under Next.js unstable_cache 2MB limit. */
const POKEMON_DEX_INDEX_CACHE_KEY = "master-card-list-pokemon-dex-index-v5-packed";
const POKEMON_DEX_INDEX_REVALIDATE_SEC = 300;
const DEFAULT_CARD_ORDER_CACHE_KEY = "master-card-list-default-order-v2";
const DEFAULT_CARD_ORDER_REVALIDATE_SEC = 300;

function normalizeFilterValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Fold accents and case so "Pokemon" and "Pokémon" share one facet bucket. */
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

function toDocumentId(id: string | number): string {
  return typeof id === "string" ? id : String(id);
}

function getRelationshipDocumentId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") return id;
    if (typeof id === "number") return String(id);
  }
  return null;
}

const EXCLUDED_BASIC_RARITIES = ["Common", "Uncommon", "common", "uncommon"];

function buildMasterCardsWhere(
  setDocumentId: string | null,
  activeRarity: string,
  activeSearch: string,
  excludeCommonUncommon: boolean,
  categoryQueryVariants: string[],
): Where {
  const clauses: Where[] = [{ imageLow: { exists: true } }];

  if (setDocumentId) {
    clauses.push({ set: { equals: setDocumentId } });
  }

  if (activeRarity) {
    clauses.push({ rarity: { equals: activeRarity } });
  }

  if (excludeCommonUncommon) {
    clauses.push({
      or: [
        { rarity: { exists: false } },
        { rarity: { not_in: EXCLUDED_BASIC_RARITIES } },
      ],
    });
  }

  if (categoryQueryVariants.length === 1) {
    clauses.push({ category: { equals: categoryQueryVariants[0] } });
  } else if (categoryQueryVariants.length > 1) {
    clauses.push({
      or: categoryQueryVariants.map((value) => ({ category: { equals: value } })),
    });
  }

  const q = activeSearch.trim();
  if (q) {
    clauses.push({ cardName: { contains: q } });
  }

  if (clauses.length === 1) {
    return clauses[0] as Where;
  }

  return { and: clauses };
}

function toFiniteDexNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

const DEX_ID_NEST_SKIP_KEYS = new Set([
  "set",
  "brand",
  "imageLow",
  "imageHigh",
  "_rels",
  "_locales",
]);

/**
 * Read dex id JSON from a Payload `master-card-list` doc.
 * Tabs / groups can nest fields, so we check the root then shallow recursive object keys.
 */
function pickDexIdRawFromDoc(doc: Record<string, unknown>): unknown {
  const top =
    doc.dexId ??
    doc.dex_id ??
    doc.nationalPokedexNumbers ??
    doc.national_pokedex_numbers;
  if (top !== undefined && top !== null && top !== "") return top;
  return findDexIdRawNested(doc, 0);
}

function findDexIdRawNested(node: unknown, depth: number): unknown {
  if (node === null || node === undefined || depth > 8) return undefined;
  if (typeof node !== "object" || Array.isArray(node)) return undefined;
  const o = node as Record<string, unknown>;
  if ("dexId" in o && o.dexId !== undefined && o.dexId !== null && o.dexId !== "") {
    return o.dexId;
  }
  if ("dex_id" in o && o.dex_id !== undefined && o.dex_id !== null && o.dex_id !== "") {
    return o.dex_id;
  }
  if (
    "nationalPokedexNumbers" in o &&
    o.nationalPokedexNumbers !== undefined &&
    o.nationalPokedexNumbers !== null &&
    o.nationalPokedexNumbers !== ""
  ) {
    return o.nationalPokedexNumbers;
  }
  for (const key of Object.keys(o)) {
    if (DEX_ID_NEST_SKIP_KEYS.has(key)) continue;
    const v = o[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const found = findDexIdRawNested(v, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function dedupeDexOrder(values: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of values) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Unwrap `{ value: … }` chains (Payload / import sometimes nests value rows). */
function unwrapNestedValueRecords(raw: unknown, depth: number): unknown {
  if (depth > 10) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === "value") {
      return unwrapNestedValueRecords(o.value, depth + 1);
    }
  }
  return raw;
}

function coerceDexNumber(value: unknown): number | null {
  return toFiniteDexNumber(unwrapNestedValueRecords(value, 0));
}

/** Repeated JSON-as-string layers (double-encoded jsonb / migration artifacts). */
function peelJsonStringLayers(raw: unknown, maxLayers: number): unknown {
  let cur: unknown = raw;
  for (let i = 0; i < maxLayers; i++) {
    if (typeof cur !== "string") return cur;
    const t = cur.trim();
    if (!t) return cur;
    const looksStructured =
      (t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"));
    if (!looksStructured) return cur;
    try {
      cur = JSON.parse(t) as unknown;
    } catch {
      return cur;
    }
  }
  return cur;
}

const DEX_ID_WRAPPER_KEYS = [
  "nationalPokedexNumbers",
  "national_pokedex_numbers",
  "dexId",
  "dex_id",
  "data",
  "items",
  "values",
  "numbers",
  "ids",
] as const;

/**
 * Normalizes `dexId` / `dex_id` JSON from Postgres/Payload (arrays, `{ value }`, stringified JSON, etc.).
 */
function extractDexIdValues(raw: unknown, depth = 0): number[] {
  if (raw === null || raw === undefined) return [];
  if (depth > 8) return [];

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    try {
      return extractDexIdValues(JSON.parse(raw.toString("utf8")) as unknown, depth + 1);
    } catch {
      return [];
    }
  }

  raw = peelJsonStringLayers(raw, 5);

  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    if (
      (t.startsWith("[") && t.endsWith("]")) ||
      (t.startsWith("{") && t.endsWith("}"))
    ) {
      try {
        return extractDexIdValues(JSON.parse(t) as unknown, depth + 1);
      } catch {
        return dedupeDexOrder([toFiniteDexNumber(t)].filter((n): n is number => n !== null));
      }
    }
    const n = toFiniteDexNumber(t);
    return n !== null ? [n] : [];
  }

  const rootSingle = coerceDexNumber(raw);
  if (rootSingle !== null) return [rootSingle];

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const keys = Object.keys(o);
    if (
      keys.length > 0 &&
      keys.every((k) => /^\d+$/.test(k)) &&
      !("value" in o) &&
      !("dex_id" in o) &&
      !("dexId" in o)
    ) {
      const arr = keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => o[k]);
      return extractDexIdValues(arr, depth + 1);
    }

    let n: number | null = null;
    if ("value" in o) n = coerceDexNumber(o.value);
    if (n === null && "dex_id" in o) n = coerceDexNumber(o.dex_id);
    if (n === null && "dexId" in o) n = coerceDexNumber(o.dexId);
    if (n !== null) return [n];

    for (const key of DEX_ID_WRAPPER_KEYS) {
      if (!(key in o)) continue;
      const innerRaw = o[key];
      if (innerRaw === null || innerRaw === undefined || innerRaw === "") continue;
      const inner = extractDexIdValues(innerRaw, depth + 1);
      if (inner.length > 0) return inner;
    }
    return [];
  }

  if (!Array.isArray(raw)) return [];

  const values: number[] = [];
  for (const item of raw) {
    const direct = coerceDexNumber(item);
    if (direct !== null) {
      values.push(direct);
      continue;
    }
    if (Array.isArray(item)) {
      values.push(...extractDexIdValues(item, depth + 1));
      continue;
    }
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      let n: number | null = null;
      if ("value" in obj) n = coerceDexNumber(obj.value);
      if (n === null && "dex_id" in obj) n = coerceDexNumber(obj.dex_id);
      if (n === null && "dexId" in obj) n = coerceDexNumber(obj.dexId);
      if (n !== null) values.push(n);
    }
  }

  return dedupeDexOrder(values);
}

type PokemonDexIndexEntry = {
  id: string;
  setId: string | null;
  rarity: string;
  /** Accent-folded category key (matches `categoryFacetKey` on filter label). */
  categoryKey: string;
  cardNameLower: string;
  cardNumberRank: number;
};

type PokemonDexIndex = Record<string, PokemonDexIndexEntry[]>;

/**
 * One row per {@link PokemonDexIndexEntry}: [id, setId, rarity, categoryKey, cardNameLower, cardNumberRank].
 * Tuple JSON is much smaller than repeated object keys — needed for Next.js `unstable_cache` (~2MB max).
 */
type PokemonDexIndexPackedRow = readonly [string, string | null, string, string, string, number];
type PokemonDexIndexPacked = Record<string, PokemonDexIndexPackedRow[]>;

function packPokemonDexIndex(index: PokemonDexIndex): PokemonDexIndexPacked {
  const out: PokemonDexIndexPacked = {};
  for (const [dexKey, entries] of Object.entries(index)) {
    out[dexKey] = entries.map(
      (e): PokemonDexIndexPackedRow =>
        [e.id, e.setId, e.rarity, e.categoryKey, e.cardNameLower, e.cardNumberRank] as const,
    );
  }
  return out;
}

function unpackPokemonDexIndex(packed: PokemonDexIndexPacked): PokemonDexIndex {
  const out: PokemonDexIndex = {};
  for (const [dexKey, rows] of Object.entries(packed)) {
    out[dexKey] = rows.map(
      (t): PokemonDexIndexEntry => ({
        id: t[0],
        setId: t[1],
        rarity: t[2],
        categoryKey: t[3],
        cardNameLower: t[4],
        cardNumberRank: t[5],
      }),
    );
  }
  return out;
}

async function loadPokemonDexIndex(): Promise<PokemonDexIndex> {
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const index: PokemonDexIndex = {};

  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const result = await payload.find({
      collection: "master-card-list",
      depth: 0,
      limit: 1000,
      page,
      overrideAccess: true,
      select: {
        id: true,
        set: true,
        rarity: true,
        category: true,
        cardName: true,
        dexId: true,
      },
      where: {
        imageLow: {
          exists: true,
        },
      },
      sort: "id",
    });

    for (const doc of result.docs) {
      const docId = getRelationshipDocumentId((doc as { id?: unknown }).id);
      if (!docId) continue;

      const rawCategory = typeof doc.category === "string" ? doc.category.trim() : "";
      const entry: PokemonDexIndexEntry = {
        id: docId,
        setId: getRelationshipDocumentId((doc as { set?: unknown }).set),
        rarity: typeof doc.rarity === "string" ? doc.rarity.trim() : "",
        categoryKey: rawCategory ? categoryFacetKey(rawCategory) : "",
        cardNameLower:
          typeof doc.cardName === "string" ? doc.cardName.trim().toLocaleLowerCase() : "",
        cardNumberRank: getCardNumberRank((doc as { cardNumber?: unknown }).cardNumber),
      };

      const dexIds = extractDexIdValues(pickDexIdRawFromDoc(doc as Record<string, unknown>));
      for (const dexId of dexIds) {
        const key = String(dexId);
        if (!index[key]) index[key] = [];
        index[key].push(entry);
      }
    }

    hasNextPage = result.hasNextPage;
    page += 1;
  }

  return index;
}

const getCachedPokemonDexIndexPacked = unstable_cache(
  async () => packPokemonDexIndex(await loadPokemonDexIndex()),
  [POKEMON_DEX_INDEX_CACHE_KEY],
  { revalidate: POKEMON_DEX_INDEX_REVALIDATE_SEC },
);

async function getCachedPokemonDexIndex(): Promise<PokemonDexIndex> {
  const packed = await getCachedPokemonDexIndexPacked();
  return unpackPokemonDexIndex(packed);
}

type DefaultCardOrderEntry = {
  id: string;
  setReleaseTimestamp: number;
  setCode: string;
  cardNumberRank: number;
};

function getCardNumberRank(cardNumber: unknown): number {
  if (typeof cardNumber !== "string") return -1;
  const trimmed = cardNumber.trim();
  if (!trimmed) return -1;

  const beforeSlash = trimmed.split("/")[0] ?? trimmed;
  const match = beforeSlash.match(/\d+/);
  if (!match) return -1;

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

/** Same ordering as `loadDefaultCardOrder` (newest set release first, then set code, card #, id). */
function getMasterCardDocBrowseSortKeys(doc: Record<string, unknown>): {
  setReleaseTimestamp: number;
  setCode: string;
  cardNumberRank: number;
  id: string;
} {
  const setObj =
    doc.set && typeof doc.set === "object" ? (doc.set as Record<string, unknown>) : null;
  const releaseRaw =
    setObj && "releaseDate" in setObj && typeof setObj.releaseDate === "string"
      ? new Date(setObj.releaseDate).getTime()
      : 0;
  const setCode = resolveCanonicalSetCodeFromSetRelation(setObj);
  const id = getRelationshipDocumentId(doc.id) ?? "";
  return {
    setReleaseTimestamp: Number.isFinite(releaseRaw) ? releaseRaw : 0,
    setCode,
    cardNumberRank: getCardNumberRank(doc.cardNumber),
    id,
  };
}

function compareMasterCardDocsByDefaultBrowseOrder(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  const ka = getMasterCardDocBrowseSortKeys(a);
  const kb = getMasterCardDocBrowseSortKeys(b);
  if (ka.setReleaseTimestamp !== kb.setReleaseTimestamp) {
    return kb.setReleaseTimestamp - ka.setReleaseTimestamp;
  }
  if (ka.setCode !== kb.setCode) {
    return ka.setCode.localeCompare(kb.setCode);
  }
  if (ka.cardNumberRank !== kb.cardNumberRank) {
    return kb.cardNumberRank - ka.cardNumberRank;
  }
  return kb.id.localeCompare(ka.id);
}

async function loadDefaultCardOrder(): Promise<DefaultCardOrderEntry[]> {
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const rows: DefaultCardOrderEntry[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await payload.find({
      collection: "master-card-list",
      depth: 1,
      limit: 1000,
      page,
      overrideAccess: true,
      select: {
        id: true,
        set: true,
        cardNumber: true,
      },
      where: {
        imageLow: {
          exists: true,
        },
      },
      sort: "id",
    });

    for (const doc of result.docs) {
      const id = getRelationshipDocumentId((doc as { id?: unknown }).id);
      if (!id) continue;

      const setReleaseTimestamp =
        typeof doc.set === "object" &&
        doc.set &&
        "releaseDate" in doc.set &&
        typeof doc.set.releaseDate === "string"
          ? new Date(doc.set.releaseDate).getTime()
          : 0;

      const setCode = resolveCanonicalSetCodeFromSetRelation(
        typeof doc.set === "object" && doc.set ? doc.set : null,
      );

      rows.push({
        id,
        setReleaseTimestamp: Number.isFinite(setReleaseTimestamp) ? setReleaseTimestamp : 0,
        setCode,
        cardNumberRank: getCardNumberRank((doc as { cardNumber?: unknown }).cardNumber),
      });
    }

    hasNextPage = result.hasNextPage;
    page += 1;
  }

  return rows.sort((a, b) => {
    if (a.setReleaseTimestamp !== b.setReleaseTimestamp) {
      return b.setReleaseTimestamp - a.setReleaseTimestamp;
    }
    if (a.setCode !== b.setCode) {
      return a.setCode.localeCompare(b.setCode);
    }
    if (a.cardNumberRank !== b.cardNumberRank) {
      return b.cardNumberRank - a.cardNumberRank;
    }
    return b.id.localeCompare(a.id);
  });
}

const getCachedDefaultCardOrder = unstable_cache(
  async () => loadDefaultCardOrder(),
  [DEFAULT_CARD_ORDER_CACHE_KEY],
  { revalidate: DEFAULT_CARD_ORDER_REVALIDATE_SEC },
);

async function loadFilterFacets(): Promise<{
  setCodes: string[];
  rarityDisplayValues: string[];
  categoryDisplayValues: string[];
  /** Canonical dropdown label → exact DB strings to match (OR). */
  categoryMatchGroups: Record<string, string[]>;
}> {
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const setCodesSeen = new Set<string>();
  const rarityMap = new Map<string, string>();
  const categoryGroups = new Map<string, Set<string>>();

  const setsResult = await payload.find({
    collection: "sets",
    depth: 0,
    limit: 2000,
    page: 1,
    overrideAccess: true,
    select: {
      code: true,
      tcgdexId: true,
      setImage: true,
    },
    where: {
      and: [
        {
          or: [{ tcgdexId: { exists: true } }, { code: { exists: true } }],
        },
        {
          setImage: {
            exists: true,
          },
        },
      ],
    },
    sort: "name",
  });

  for (const setDoc of setsResult.docs) {
    const code = resolveCanonicalSetCodeFromSetRelation(setDoc);
    if (code) setCodesSeen.add(code);
  }

  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await payload.find({
      collection: "master-card-list",
      depth: 0,
      limit: 1000,
      page,
      overrideAccess: true,
      select: {
        rarity: true,
        category: true,
      },
      where: {
        imageLow: {
          exists: true,
        },
      },
    });

    for (const doc of result.docs) {
      const rarity = typeof doc.rarity === "string" ? doc.rarity.trim() : "";
      if (rarity) {
        const normalizedDisplay = normalizeFilterValue(rarity);
        if (!normalizedDisplay) continue;
        const key = normalizedDisplay.toLocaleLowerCase();
        if (!rarityMap.has(key)) {
          rarityMap.set(key, normalizedDisplay);
        }
      }

      const category = typeof doc.category === "string" ? doc.category.trim() : "";
      if (category) {
        const facetKey = categoryFacetKey(category);
        if (!facetKey) continue;
        const variants = categoryGroups.get(facetKey) ?? new Set<string>();
        variants.add(category);
        categoryGroups.set(facetKey, variants);
      }
    }

    hasNextPage = result.hasNextPage;
    page += 1;
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

  return {
    setCodes: [...setCodesSeen],
    rarityDisplayValues: [...rarityMap.values()].sort((a, b) => a.localeCompare(b)),
    categoryDisplayValues,
    categoryMatchGroups,
  };
}

/** Map URL `category` param to canonical label and DB values (handles legacy spellings). */
export function resolveCardsCategoryFilter(
  selectedFromUrl: string,
  displayValues: string[],
  matchGroups: Record<string, string[]>,
): { canonicalLabel: string; queryVariants: string[] } {
  const trimmed = selectedFromUrl.trim();
  if (!trimmed) {
    return { canonicalLabel: "", queryVariants: [] };
  }

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

/** Payload `select` for hydrating a `master-card-list` doc into `CardsPageCardEntry`. */
const MASTER_CARD_LIST_ENTRY_SELECT = {
  id: true,
  externalId: true,
  tcgdex_id: true,
  localId: true,
  set: true,
  imageLow: true,
  imageHigh: true,
  rarity: true,
  cardNumber: true,
  cardName: true,
  category: true,
  stage: true,
  hp: true,
  elementTypes: true,
  dexId: true,
  artist: true,
  regulationMark: true,
  cardmarketListingVersion: true,
} as const;

function normalizeTcgdexLocalId(localIdRaw: unknown): string | null {
  if (typeof localIdRaw !== "string") return null;
  const trimmed = localIdRaw.trim();
  if (!trimmed) return null;
  if (/^\d+$/u.test(trimmed)) return trimmed.padStart(3, "0");
  return trimmed;
}

export function masterCardDocToCardsPageEntry(doc: Record<string, unknown>): CardsPageCardEntry | null {
  const relation = isImageRelation(doc.imageLow) ? doc.imageLow : null;
  const lowUrl = typeof relation?.url === "string" ? relation.url : "";
  if (!lowUrl) return null;

  const highRelation = isImageRelation(doc.imageHigh) ? doc.imageHigh : null;
  const highUrl = typeof highRelation?.url === "string" ? highRelation.url : lowUrl;

  const cleanPath = lowUrl.split("?")[0];
  const filename =
    (typeof relation?.filename === "string" && relation.filename) || cleanPath.split("/").pop();
  if (!filename) return null;

  const set = resolveCanonicalSetCodeFromSetRelation(doc.set) || "unknown";

  const setObj =
    typeof doc.set === "object" && doc.set && !Array.isArray(doc.set)
      ? (doc.set as Record<string, unknown>)
      : null;
  const releaseRaw =
    setObj && typeof setObj.releaseDate === "string" ? setObj.releaseDate.trim() : "";

  const masterCardId = getRelationshipDocumentId(doc.id);
  const tcgdexStored =
    typeof doc.tcgdex_id === "string" && doc.tcgdex_id.trim() ? doc.tcgdex_id.trim() : undefined;
  const extStored =
    typeof doc.externalId === "string" && doc.externalId.trim() ? doc.externalId.trim() : undefined;
  const setTcgdexId =
    setObj && typeof setObj.tcgdexId === "string" && setObj.tcgdexId.trim()
      ? setObj.tcgdexId.trim()
      : undefined;
  const localIdNormalized = normalizeTcgdexLocalId(doc.localId);
  const derivedFromSetAndLocal =
    setTcgdexId && localIdNormalized ? `${setTcgdexId}-${localIdNormalized}` : undefined;
  const ext = tcgdexStored ?? extStored ?? derivedFromSetAndLocal;
  const legacyExternalId =
    tcgdexStored !== undefined ? extStored ?? derivedFromSetAndLocal : derivedFromSetAndLocal;

  return {
    ...(masterCardId ? { masterCardId } : {}),
    ...(ext ? { externalId: ext } : {}),
    ...(legacyExternalId ? { legacyExternalId } : {}),
    set,
    setSlug:
      setObj && typeof setObj.slug === "string" && setObj.slug.trim()
        ? setObj.slug.trim()
        : undefined,
    setName:
      typeof doc.set === "object" &&
      doc.set &&
      "name" in doc.set &&
      typeof doc.set.name === "string"
        ? doc.set.name
        : undefined,
    setTcgdexId,
    setCardCountOfficial:
      setObj &&
      typeof setObj.cardCountOfficial === "number" &&
      Number.isFinite(setObj.cardCountOfficial) &&
      setObj.cardCountOfficial >= 0
        ? Math.floor(setObj.cardCountOfficial)
        : undefined,
    setLogoSrc:
      typeof doc.set === "object" &&
      doc.set &&
      "setImage" in doc.set &&
      typeof doc.set.setImage === "object" &&
      doc.set.setImage &&
      "url" in doc.set.setImage &&
      typeof doc.set.setImage.url === "string"
        ? resolveMediaURL(doc.set.setImage.url)
        : undefined,
    setReleaseDate: releaseRaw || undefined,
    cardNumber: typeof doc.cardNumber === "string" ? doc.cardNumber.trim() : undefined,
    filename,
    src: resolveMediaURL(lowUrl),
    lowSrc: resolveMediaURL(lowUrl),
    highSrc: resolveMediaURL(highUrl),
    rarity: typeof doc.rarity === "string" ? doc.rarity.trim() : "",
    cardName: typeof doc.cardName === "string" ? doc.cardName.trim() : "",
    category: typeof doc.category === "string" ? doc.category.trim() : undefined,
    stage: typeof doc.stage === "string" ? doc.stage.trim() : undefined,
    hp: typeof doc.hp === "number" && Number.isFinite(doc.hp) ? doc.hp : undefined,
    elementTypes: Array.isArray(doc.elementTypes)
      ? doc.elementTypes.filter((item): item is string => typeof item === "string")
      : undefined,
    dexIds: extractDexIdValues(pickDexIdRawFromDoc(doc)),
    artist: typeof doc.artist === "string" ? doc.artist.trim() : undefined,
    regulationMark:
      typeof doc.regulationMark === "string" ? doc.regulationMark.trim() : undefined,
    cardmarketListingVersion:
      typeof doc.cardmarketListingVersion === "number" &&
      Number.isFinite(doc.cardmarketListingVersion) &&
      doc.cardmarketListingVersion >= 1
        ? Math.floor(doc.cardmarketListingVersion)
        : undefined,
  };
}

const BY_NATIONAL_DEX_MAX_CARDS = 500;
const BY_NATIONAL_DEX_FETCH_CHUNK = 200;

/**
 * All master cards with an image that match any of the given National Dex numbers,
 * in default browse order (newest set release first), capped for safety.
 */
export async function fetchMasterCardsByNationalDexIds(
  dexIds: number[],
  options?: { limit?: number },
): Promise<CardsPageCardEntry[]> {
  const uniqueDex = [...new Set(dexIds.filter((n) => Number.isFinite(n) && n > 0))];
  if (uniqueDex.length === 0) return [];

  const limitCap = Math.min(
    typeof options?.limit === "number" && options.limit > 0 ? options.limit : BY_NATIONAL_DEX_MAX_CARDS,
    BY_NATIONAL_DEX_MAX_CARDS,
  );

  const dexIndex = await getCachedPokemonDexIndex();
  const idSet = new Set<string>();
  for (const dex of uniqueDex) {
    const list = dexIndex[String(dex)] ?? [];
    for (const entry of list) {
      idSet.add(entry.id);
    }
  }

  const allIds = [...idSet];
  if (allIds.length === 0) return [];

  const orderedRows = await getCachedDefaultCardOrder();
  const orderRank = new Map<string, number>();
  orderedRows.forEach((row, index) => {
    orderRank.set(row.id, index);
  });

  allIds.sort((a, b) => {
    const ra = orderRank.get(a);
    const rb = orderRank.get(b);
    if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
    if (ra === undefined && rb !== undefined) return 1;
    if (rb === undefined && ra !== undefined) return -1;
    return a.localeCompare(b);
  });

  const pageIds = allIds.slice(0, limitCap);

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const docsById = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < pageIds.length; i += BY_NATIONAL_DEX_FETCH_CHUNK) {
    const chunk = pageIds.slice(i, i + BY_NATIONAL_DEX_FETCH_CHUNK);
    const pageResult = await payload.find({
      collection: "master-card-list",
      depth: 1,
      limit: chunk.length,
      page: 1,
      overrideAccess: true,
      select: MASTER_CARD_LIST_ENTRY_SELECT,
      where: {
        id: {
          in: chunk,
        },
      },
    });

    for (const doc of pageResult.docs) {
      const docId = getRelationshipDocumentId((doc as { id?: unknown }).id);
      if (docId) docsById.set(docId, doc as unknown as Record<string, unknown>);
    }
  }

  return pageIds
    .map((id) => docsById.get(id))
    .filter((doc): doc is Record<string, unknown> => Boolean(doc))
    .map((doc) => masterCardDocToCardsPageEntry(doc))
    .filter((entry): entry is CardsPageCardEntry => Boolean(entry));
}

/** Cached facets for sidebar filters (lighter than loading full card rows with media). */
export const getCachedFilterFacets = unstable_cache(
  async () => loadFilterFacets(),
  [FILTER_FACETS_CACHE_KEY],
  { revalidate: FILTER_FACETS_REVALIDATE_SEC },
);

export async function fetchMasterCardsPage(params: {
  activeSet: string;
  activeRarity: string;
  activeSearch: string;
  activePokemonDex: number | null;
  activePokemonName: string | null;
  excludeCommonUncommon: boolean;
  categoryQueryVariants: string[];
  page: number;
  perPage: number;
}): Promise<{ entries: CardsPageCardEntry[]; totalDocs: number }> {
  const pageSize = Math.min(CARDS_TAKE_MAX, Math.max(1, Math.floor(params.perPage)));

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  let setDocumentId: string | null = null;
  if (params.activeSet) {
    const setMatch = await payload.find({
      collection: "sets",
      depth: 0,
      limit: 1,
      overrideAccess: true,
      select: { id: true },
      where: {
        or: [
          { tcgdexId: { equals: params.activeSet } },
          { code: { equals: params.activeSet } },
        ],
      },
    });

    const setDoc = setMatch.docs[0];
    if (!setDoc) return { entries: [], totalDocs: 0 };
    setDocumentId = toDocumentId(setDoc.id);
  }

  const where = buildMasterCardsWhere(
    setDocumentId,
    params.activeRarity,
    params.activeSearch,
    params.excludeCommonUncommon,
    params.categoryQueryVariants,
  );

  if (params.activePokemonDex === null) {
    const isDefaultUnfiltered =
      !params.activeSet &&
      !params.activeRarity &&
      !params.activeSearch &&
      !params.excludeCommonUncommon &&
      params.categoryQueryVariants.length === 0;
    if (isDefaultUnfiltered) {
      const orderedRows = await getCachedDefaultCardOrder();
      const totalDocs = orderedRows.length;
      const startIndex = (params.page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const pageRows = orderedRows.slice(startIndex, endIndex);
      const pageIds = pageRows.map((row) => row.id);
      if (pageIds.length === 0) {
        return { entries: [], totalDocs };
      }

      const pageResult = await payload.find({
        collection: "master-card-list",
        depth: 1,
        limit: pageIds.length,
        page: 1,
        overrideAccess: true,
        select: MASTER_CARD_LIST_ENTRY_SELECT,
        where: {
          id: {
            in: pageIds,
          },
        },
      });

      const docsById = new Map<string, Record<string, unknown>>();
      for (const doc of pageResult.docs) {
        const docId = getRelationshipDocumentId((doc as { id?: unknown }).id);
        if (docId) docsById.set(docId, doc as unknown as Record<string, unknown>);
      }

      const entries = pageIds
        .map((id) => docsById.get(id))
        .filter((doc): doc is Record<string, unknown> => Boolean(doc))
        .map((doc) => masterCardDocToCardsPageEntry(doc))
        .filter((entry): entry is CardsPageCardEntry => Boolean(entry));

      return { entries, totalDocs };
    }

    // For filtered views, compute full match set and paginate after numeric card number sort.
    const matchedDocs: Record<string, unknown>[] = [];
    let filterPage = 1;
    let hasNextPage = true;
    while (hasNextPage) {
      const result = await payload.find({
        collection: "master-card-list",
        depth: 1,
        limit: 1000,
        page: filterPage,
        overrideAccess: true,
        select: MASTER_CARD_LIST_ENTRY_SELECT,
        sort: "id",
        where,
      });

      matchedDocs.push(...(result.docs as unknown as Record<string, unknown>[]));
      hasNextPage = result.hasNextPage;
      filterPage += 1;
    }

    if (params.excludeCommonUncommon) {
      matchedDocs.sort(compareMasterCardDocsByDefaultBrowseOrder);
    } else {
      matchedDocs.sort((a, b) => {
        const rankA = getCardNumberRank((a as { cardNumber?: unknown }).cardNumber);
        const rankB = getCardNumberRank((b as { cardNumber?: unknown }).cardNumber);
        if (rankA !== rankB) return rankB - rankA;

        const nameA =
          typeof (a as { cardName?: unknown }).cardName === "string"
            ? (a as { cardName: string }).cardName
            : "";
        const nameB =
          typeof (b as { cardName?: unknown }).cardName === "string"
            ? (b as { cardName: string }).cardName
            : "";
        return nameA.localeCompare(nameB);
      });
    }

    const totalDocs = matchedDocs.length;
    const startIndex = (params.page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const entries = matchedDocs
      .slice(startIndex, endIndex)
      .map((doc) => masterCardDocToCardsPageEntry(doc))
      .filter((entry): entry is CardsPageCardEntry => Boolean(entry));

    return { entries, totalDocs };
  }

  const dexIndex = await getCachedPokemonDexIndex();
  const candidates = dexIndex[String(params.activePokemonDex)] ?? [];
  const searchQuery = params.activeSearch.trim().toLocaleLowerCase();
  const categoryFilterKey =
    params.categoryQueryVariants.length > 0
      ? categoryFacetKey(params.categoryQueryVariants[0])
      : "";
  const filteredCandidates = candidates.filter((entry) => {
    if (setDocumentId && entry.setId !== setDocumentId) return false;
    if (params.activeRarity && entry.rarity !== params.activeRarity) return false;
    if (searchQuery && !entry.cardNameLower.includes(searchQuery)) return false;
    if (params.excludeCommonUncommon) {
      const lr = entry.rarity.trim().toLocaleLowerCase();
      if (lr === "common" || lr === "uncommon") return false;
    }
    if (categoryFilterKey && entry.categoryKey !== categoryFilterKey) return false;
    return true;
  });

  const orderedRows = await getCachedDefaultCardOrder();
  const orderRank = new Map<string, number>();
  orderedRows.forEach((row, index) => {
    orderRank.set(row.id, index);
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
  const endIndex = startIndex + pageSize;
  const pageCandidates = filteredCandidates.slice(startIndex, endIndex);
  if (pageCandidates.length === 0) {
    return { entries: [], totalDocs };
  }

  const pageIds = pageCandidates.map((entry) => entry.id);
  const pageResult = await payload.find({
    collection: "master-card-list",
    depth: 1,
    limit: pageIds.length,
    page: 1,
    overrideAccess: true,
    select: MASTER_CARD_LIST_ENTRY_SELECT,
    where: {
      id: {
        in: pageIds,
      },
    },
  });

  const docsById = new Map<string, Record<string, unknown>>();
  for (const doc of pageResult.docs) {
    const docId = getRelationshipDocumentId((doc as { id?: unknown }).id);
    if (docId) docsById.set(docId, doc as unknown as Record<string, unknown>);
  }

  const entries = pageIds
    .map((id) => docsById.get(id))
    .filter((doc): doc is Record<string, unknown> => Boolean(doc))
    .map((doc) => masterCardDocToCardsPageEntry(doc))
    .filter((entry): entry is CardsPageCardEntry => Boolean(entry));

  return { entries, totalDocs };
}
