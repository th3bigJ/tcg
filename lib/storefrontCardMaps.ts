import config from "@payload-config";
import { getPayload } from "payload";

import { masterCardDocToCardsPageEntry, type CardsPageCardEntry } from "@/lib/cardsPageQueries";
import { getRelationshipDocumentId, toPayloadRelationshipId } from "@/lib/relationshipId";

export type StorefrontCardExtras = {
  collectionEntryId?: string;
  wishlistEntryId?: string;
  conditionLabel?: string;
  quantity?: number;
  /** From `customer-collections` row (catalog variant / finish). */
  printing?: string;
  language?: string;
  priority?: "low" | "medium" | "high";
  targetConditionId?: string;
  targetPrinting?: string;
};

/** One saved row in the customer’s collection (for modal / summaries). */
export type CollectionLineSummary = {
  entryId: string;
  quantity: number;
  conditionLabel: string;
  printing: string;
  language: string;
};

export type StorefrontCardEntry = CardsPageCardEntry & StorefrontCardExtras;

export async function fetchItemConditionOptions(): Promise<{ id: string; name: string }[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "item-conditions",
    depth: 0,
    limit: 200,
    overrideAccess: true,
    sort: "sortOrder",
  });

  const out: { id: string; name: string }[] = [];
  for (const doc of result.docs) {
    const id = getRelationshipDocumentId((doc as { id?: unknown }).id);
    const rawName = (doc as { name?: unknown }).name;
    const name = typeof rawName === "string" ? rawName : "";
    if (id && name) out.push({ id, name });
  }
  return out;
}

function mapMasterPopulated(master: unknown): CardsPageCardEntry | null {
  if (!master || typeof master !== "object") return null;
  return masterCardDocToCardsPageEntry(master as Record<string, unknown>);
}

export function mapCustomerCollectionDoc(doc: unknown): StorefrontCardEntry | null {
  if (!doc || typeof doc !== "object") return null;
  const row = doc as Record<string, unknown>;
  const base = mapMasterPopulated(row.masterCard);
  if (!base) return null;

  const entryId = getRelationshipDocumentId(row.id);
  const cond = row.condition;
  let conditionLabel = "";
  if (cond && typeof cond === "object" && "name" in cond && typeof cond.name === "string") {
    conditionLabel = cond.name;
  }
  const qty = typeof row.quantity === "number" && Number.isFinite(row.quantity) ? row.quantity : 1;
  const printing = typeof row.printing === "string" && row.printing.trim() ? row.printing.trim() : undefined;
  const language = typeof row.language === "string" && row.language.trim() ? row.language.trim() : undefined;

  return {
    ...base,
    ...(entryId ? { collectionEntryId: entryId } : {}),
    ...(conditionLabel ? { conditionLabel } : {}),
    ...(printing ? { printing } : {}),
    ...(language ? { language } : {}),
    quantity: qty,
  };
}

/** Group Payload collection rows by catalog card id for quick modal lookups. */
export function groupCollectionLinesByMasterCardId(
  entries: StorefrontCardEntry[],
): Record<string, CollectionLineSummary[]> {
  const map: Record<string, CollectionLineSummary[]> = {};
  for (const e of entries) {
    const mid = e.masterCardId;
    const entryId = e.collectionEntryId;
    if (!mid || !entryId) continue;
    const line: CollectionLineSummary = {
      entryId,
      quantity: typeof e.quantity === "number" && Number.isFinite(e.quantity) && e.quantity >= 1 ? e.quantity : 1,
      conditionLabel: e.conditionLabel?.trim() ? e.conditionLabel.trim() : "—",
      printing: e.printing?.trim() ? e.printing.trim() : "Standard",
      language: e.language?.trim() ? e.language.trim() : "English",
    };
    if (!map[mid]) map[mid] = [];
    map[mid].push(line);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => {
      const c = a.conditionLabel.localeCompare(b.conditionLabel);
      if (c !== 0) return c;
      const p = a.printing.localeCompare(b.printing);
      if (p !== 0) return p;
      return a.language.localeCompare(b.language);
    });
  }
  return map;
}

/**
 * One tile per catalog card on the collection grid: sums quantities across all
 * `customer-collections` rows for the same `masterCardId`, clears per-row labels.
 * Preserves first-seen order from `fetchCollectionCardEntries` (newest first).
 */
export function mergeCollectionEntriesForGrid(entries: StorefrontCardEntry[]): StorefrontCardEntry[] {
  const processedMasters = new Set<string>();
  const out: StorefrontCardEntry[] = [];

  for (const e of entries) {
    const mid = e.masterCardId;
    if (!mid) {
      out.push({ ...e });
      continue;
    }
    if (processedMasters.has(mid)) continue;
    processedMasters.add(mid);

    let total = 0;
    for (const x of entries) {
      if (x.masterCardId !== mid) continue;
      const q = typeof x.quantity === "number" && Number.isFinite(x.quantity) && x.quantity >= 1 ? x.quantity : 1;
      total += q;
    }

    out.push({
      ...e,
      quantity: total,
      conditionLabel: undefined,
      collectionEntryId: undefined,
      printing: undefined,
    });
  }

  return out;
}

export function mapCustomerWishlistDoc(doc: unknown): StorefrontCardEntry | null {
  if (!doc || typeof doc !== "object") return null;
  const row = doc as Record<string, unknown>;
  const base = mapMasterPopulated(row.masterCard);
  if (!base) return null;

  const entryId = getRelationshipDocumentId(row.id);
  const pri = row.priority;
  const priority =
    pri === "low" || pri === "medium" || pri === "high" ? pri : undefined;

  const tcond = row.targetCondition;
  const targetConditionId = getRelationshipDocumentId(tcond);
  const targetPrinting = typeof row.targetPrinting === "string" ? row.targetPrinting : undefined;

  return {
    ...base,
    ...(entryId ? { wishlistEntryId: entryId } : {}),
    ...(priority ? { priority } : {}),
    ...(targetConditionId ? { targetConditionId } : {}),
    ...(targetPrinting ? { targetPrinting } : {}),
  };
}

export async function fetchCollectionCardEntries(
  customerPayloadId: string,
): Promise<StorefrontCardEntry[]> {
  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customerPayloadId) ?? customerPayloadId;
  const result = await payload.find({
    collection: "customer-collections",
    where: { customer: { equals: customerRelId } },
    depth: 2,
    limit: 2000,
    sort: "-addedAt",
    overrideAccess: true,
    select: {
      masterCard: true,
      condition: true,
      quantity: true,
      printing: true,
      language: true,
    },
  });

  return result.docs
    .map((d) => mapCustomerCollectionDoc(d))
    .filter((e): e is StorefrontCardEntry => Boolean(e));
}

export async function fetchWishlistCardEntries(
  customerPayloadId: string,
): Promise<StorefrontCardEntry[]> {
  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customerPayloadId) ?? customerPayloadId;
  const result = await payload.find({
    collection: "customer-wishlists",
    where: { customer: { equals: customerRelId } },
    depth: 2,
    limit: 2000,
    sort: "-addedAt",
    overrideAccess: true,
    select: {
      masterCard: true,
      priority: true,
      targetCondition: true,
      targetPrinting: true,
    },
  });

  return result.docs
    .map((d) => mapCustomerWishlistDoc(d))
    .filter((e): e is StorefrontCardEntry => Boolean(e));
}

export async function fetchWishlistIdsByMasterCard(
  customerPayloadId: string,
): Promise<Record<string, { id: string; printing?: string }>> {
  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customerPayloadId) ?? customerPayloadId;
  const result = await payload.find({
    collection: "customer-wishlists",
    where: { customer: { equals: customerRelId } },
    depth: 0,
    limit: 2000,
    overrideAccess: true,
    select: {
      masterCard: true,
      targetPrinting: true,
    },
  });

  const map: Record<string, { id: string; printing?: string }> = {};
  for (const doc of result.docs) {
    const wid = getRelationshipDocumentId((doc as { id?: unknown }).id);
    const mid = getRelationshipDocumentId((doc as { masterCard?: unknown }).masterCard);
    const printing = (doc as { targetPrinting?: unknown }).targetPrinting;
    if (wid && mid && map[mid] === undefined) {
      map[mid] = { id: wid, printing: typeof printing === "string" ? printing : undefined };
    }
  }
  return map;
}
