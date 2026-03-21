import { unstable_cache } from "next/cache";
import type { Where } from "payload";

import { resolveMediaURL } from "@/lib/media";

export type CardsPageCardEntry = {
  set: string;
  filename: string;
  src: string;
  lowSrc: string;
  highSrc: string;
  rarity: string;
  cardName: string;
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

function normalizeFilterValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toDocumentId(id: string | number): string {
  return typeof id === "string" ? id : String(id);
}

/**
 * Payload Postgres adapter does not support nested paths like `set.code` on relationships.
 * Resolve `sets.code` → document id, then filter with `set: { equals: id }`.
 */
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

async function loadFilterFacets(): Promise<{
  setCodes: string[];
  rarityDisplayValues: string[];
}> {
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const setCodesSeen = new Set<string>();
  const rarityMap = new Map<string, string>();

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
        set: true,
        rarity: true,
      },
      where: {
        imageLow: {
          exists: true,
        },
      },
    });

    for (const doc of result.docs) {
      const setCode =
        typeof doc.set === "object" &&
        doc.set &&
        "code" in doc.set &&
        typeof doc.set.code === "string"
          ? doc.set.code
          : null;
      if (setCode && setCode !== "unknown") {
        setCodesSeen.add(setCode);
      }

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
    if (!setDoc) {
      return { entries: [], totalDocs: 0 };
    }
    setDocumentId = toDocumentId(setDoc.id);
  }

  const where = buildMasterCardsWhere(
    setDocumentId,
    params.activeRarity,
    params.activeSearch,
  );

  const result = await payload.find({
    collection: "master-card-list",
    depth: 1,
    limit: CARDS_PER_PAGE,
    page: params.page,
    overrideAccess: true,
    select: {
      set: true,
      imageLow: true,
      imageHigh: true,
      rarity: true,
      cardName: true,
    },
    sort: "id",
    where,
  });

  const entries: CardsPageCardEntry[] = [];

  for (const doc of result.docs) {
    const relation = isImageRelation(doc.imageLow) ? doc.imageLow : null;
    const lowUrl = typeof relation?.url === "string" ? relation.url : "";
    if (!lowUrl) continue;
    const highRelation = isImageRelation(doc.imageHigh) ? doc.imageHigh : null;
    const highUrl = typeof highRelation?.url === "string" ? highRelation.url : lowUrl;

    const cleanPath = lowUrl.split("?")[0];
    const filename =
      (typeof relation?.filename === "string" && relation.filename) ||
      cleanPath.split("/").pop();
    if (!filename) continue;

    const set =
      typeof doc.set === "object" &&
      doc.set &&
      "code" in doc.set &&
      typeof doc.set.code === "string"
        ? doc.set.code
        : "unknown";

    entries.push({
      set,
      filename,
      src: resolveMediaURL(lowUrl),
      lowSrc: resolveMediaURL(lowUrl),
      highSrc: resolveMediaURL(highUrl),
      rarity: typeof doc.rarity === "string" ? doc.rarity.trim() : "",
      cardName: typeof doc.cardName === "string" ? doc.cardName.trim() : "",
    });
  }

  return { entries, totalDocs: result.totalDocs };
}
