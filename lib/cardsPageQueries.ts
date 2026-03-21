import { unstable_cache } from "next/cache";
import type { Where } from "payload";

import { resolveMediaURL } from "@/lib/media";

export type CardsPageCardEntry = {
  set: string;
  setName?: string;
  setLogoSrc?: string;
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
};

type ImageRelation = {
  url?: string | null;
  filename?: string | null;
};

const isImageRelation = (value: unknown): value is ImageRelation =>
  Boolean(value) && typeof value === "object";

export const CARDS_PER_PAGE = 80;

const FILTER_FACETS_CACHE_KEY = "master-card-list-filter-facets-v1";
const FILTER_FACETS_REVALIDATE_SEC = 300;
const POKEMON_DEX_INDEX_CACHE_KEY = "master-card-list-pokemon-dex-index-v1";
const POKEMON_DEX_INDEX_REVALIDATE_SEC = 300;
const DEFAULT_CARD_ORDER_CACHE_KEY = "master-card-list-default-order-v1";
const DEFAULT_CARD_ORDER_REVALIDATE_SEC = 300;

function normalizeFilterValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
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

function buildMasterCardsWhere(
  setDocumentId: string | null,
  activeRarity: string,
  activeSearch: string,
): Where {
  const clauses: Where[] = [{ imageLow: { exists: true } }];

  if (setDocumentId) {
    clauses.push({ set: { equals: setDocumentId } });
  }

  if (activeRarity) {
    clauses.push({ rarity: { equals: activeRarity } });
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

function extractDexIdValues(dexId: unknown): number[] {
  if (!Array.isArray(dexId)) return [];

  const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseInt(value.trim(), 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  const values: number[] = [];
  for (const item of dexId) {
    const direct = toFiniteNumber(item);
    if (direct !== null) {
      values.push(direct);
      continue;
    }

    if (item && typeof item === "object" && "value" in item) {
      const nested = toFiniteNumber((item as { value?: unknown }).value);
      if (nested !== null) values.push(nested);
    }
  }

  return values;
}

type PokemonDexIndexEntry = {
  id: string;
  setId: string | null;
  rarity: string;
  cardNameLower: string;
  cardNumberRank: number;
};

type PokemonDexIndex = Record<string, PokemonDexIndexEntry[]>;

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

      const entry: PokemonDexIndexEntry = {
        id: docId,
        setId: getRelationshipDocumentId((doc as { set?: unknown }).set),
        rarity: typeof doc.rarity === "string" ? doc.rarity.trim() : "",
        cardNameLower:
          typeof doc.cardName === "string" ? doc.cardName.trim().toLocaleLowerCase() : "",
        cardNumberRank: getCardNumberRank((doc as { cardNumber?: unknown }).cardNumber),
      };

      const dexIds = extractDexIdValues((doc as { dexId?: unknown }).dexId);
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

const getCachedPokemonDexIndex = unstable_cache(
  async () => loadPokemonDexIndex(),
  [POKEMON_DEX_INDEX_CACHE_KEY],
  { revalidate: POKEMON_DEX_INDEX_REVALIDATE_SEC },
);

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

      const setCode =
        typeof doc.set === "object" &&
        doc.set &&
        "code" in doc.set &&
        typeof doc.set.code === "string"
          ? doc.set.code
          : "";

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
}> {
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const setCodesSeen = new Set<string>();
  const rarityMap = new Map<string, string>();

  const setsResult = await payload.find({
    collection: "sets",
    depth: 0,
    limit: 2000,
    page: 1,
    overrideAccess: true,
    select: {
      code: true,
      setImage: true,
    },
    where: {
      and: [
        {
          code: {
            exists: true,
          },
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
    const code = typeof setDoc.code === "string" ? setDoc.code.trim() : "";
    if (code && code !== "unknown") setCodesSeen.add(code);
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
    }

    hasNextPage = result.hasNextPage;
    page += 1;
  }

  return {
    setCodes: [...setCodesSeen],
    rarityDisplayValues: [...rarityMap.values()].sort((a, b) => a.localeCompare(b)),
  };
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
  page: number;
}): Promise<{ entries: CardsPageCardEntry[]; totalDocs: number }> {
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
        code: {
          equals: params.activeSet,
        },
      },
    });

    const setDoc = setMatch.docs[0];
    if (!setDoc) return { entries: [], totalDocs: 0 };
    setDocumentId = toDocumentId(setDoc.id);
  }

  const where = buildMasterCardsWhere(setDocumentId, params.activeRarity, params.activeSearch);

  const toEntry = (doc: Record<string, unknown>): CardsPageCardEntry | null => {
    const relation = isImageRelation(doc.imageLow) ? doc.imageLow : null;
    const lowUrl = typeof relation?.url === "string" ? relation.url : "";
    if (!lowUrl) return null;

    const highRelation = isImageRelation(doc.imageHigh) ? doc.imageHigh : null;
    const highUrl = typeof highRelation?.url === "string" ? highRelation.url : lowUrl;

    const cleanPath = lowUrl.split("?")[0];
    const filename =
      (typeof relation?.filename === "string" && relation.filename) ||
      cleanPath.split("/").pop();
    if (!filename) return null;

    const set =
      typeof doc.set === "object" &&
      doc.set &&
      "code" in doc.set &&
      typeof doc.set.code === "string"
        ? doc.set.code
        : "unknown";

    return {
      set,
      setName:
        typeof doc.set === "object" &&
        doc.set &&
        "name" in doc.set &&
        typeof doc.set.name === "string"
          ? doc.set.name
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
      dexIds: extractDexIdValues((doc as { dexId?: unknown }).dexId),
    };
  };

  if (params.activePokemonDex === null) {
    const isDefaultUnfiltered =
      !params.activeSet && !params.activeRarity && !params.activeSearch;
    if (isDefaultUnfiltered) {
      const orderedRows = await getCachedDefaultCardOrder();
      const totalDocs = orderedRows.length;
      const startIndex = (params.page - 1) * CARDS_PER_PAGE;
      const endIndex = startIndex + CARDS_PER_PAGE;
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
        select: {
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
        },
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
        .map((doc) => toEntry(doc))
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
        select: {
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
        },
        sort: "id",
        where,
      });

      matchedDocs.push(...(result.docs as unknown as Record<string, unknown>[]));
      hasNextPage = result.hasNextPage;
      filterPage += 1;
    }

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

    const totalDocs = matchedDocs.length;
    const startIndex = (params.page - 1) * CARDS_PER_PAGE;
    const endIndex = startIndex + CARDS_PER_PAGE;
    const entries = matchedDocs
      .slice(startIndex, endIndex)
      .map((doc) => toEntry(doc))
      .filter((entry): entry is CardsPageCardEntry => Boolean(entry));

    return { entries, totalDocs };
  }

  const dexIndex = await getCachedPokemonDexIndex();
  const candidates = dexIndex[String(params.activePokemonDex)] ?? [];
  const searchQuery = params.activeSearch.trim().toLocaleLowerCase();
  const filteredCandidates = candidates.filter((entry) => {
    if (setDocumentId && entry.setId !== setDocumentId) return false;
    if (params.activeRarity && entry.rarity !== params.activeRarity) return false;
    if (searchQuery && !entry.cardNameLower.includes(searchQuery)) return false;
    return true;
  });
  filteredCandidates.sort((a, b) => b.cardNumberRank - a.cardNumberRank || a.id.localeCompare(b.id));

  const totalDocs = filteredCandidates.length;
  const startIndex = (params.page - 1) * CARDS_PER_PAGE;
  const endIndex = startIndex + CARDS_PER_PAGE;
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
    select: {
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
    },
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
    .map((doc) => toEntry(doc))
    .filter((entry): entry is CardsPageCardEntry => Boolean(entry));

  return { entries, totalDocs };
}
