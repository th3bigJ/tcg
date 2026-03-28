import type { CardsPageCardEntry } from "@/lib/cardsPageQueries";
import { getCardMapById } from "@/lib/staticCardIndex";
import { getAllSets } from "@/lib/staticCards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ITEM_CONDITIONS, getItemConditionName } from "@/lib/referenceData";

export type StorefrontCardExtras = {
  collectionEntryId?: string;
  wishlistEntryId?: string;
  conditionLabel?: string;
  quantity?: number;
  printing?: string;
  language?: string;
  priority?: "low" | "medium" | "high";
  targetConditionId?: string;
  targetPrinting?: string;
  addedAt?: string;
};

export type CollectionLineSummary = {
  entryId: string;
  quantity: number;
  conditionLabel: string;
  printing: string;
  language: string;
};

export type StorefrontCardEntry = CardsPageCardEntry & StorefrontCardExtras;

export function fetchItemConditionOptions(): { id: string; name: string }[] {
  return ITEM_CONDITIONS.map((c) => ({ id: c.id, name: c.name }));
}

let _setMetaMap: Map<string, ReturnType<typeof getAllSets>[number]> | null = null;
function getSetMetaMap() {
  if (!_setMetaMap) {
    _setMetaMap = new Map();
    for (const s of getAllSets()) {
      if (s.code) _setMetaMap.set(s.code, s);
      if (s.tcgdexId) _setMetaMap.set(s.tcgdexId, s);
    }
  }
  return _setMetaMap;
}

function mapMasterCardId(masterCardId: string): CardsPageCardEntry | null {
  const cardMap = getCardMapById();
  const card = cardMap.get(masterCardId);
  if (!card || !card.imageLowSrc) return null;

  const setMeta = getSetMetaMap().get(card.setCode);
  const lowUrl = card.imageLowSrc;
  const highUrl = card.imageHighSrc ?? lowUrl;
  const filename = lowUrl.split("?")[0].split("/").pop();
  if (!filename) return null;

  const localIdNormalized = card.localId
    ? /^\d+$/u.test(card.localId.trim())
      ? card.localId.trim().padStart(3, "0")
      : card.localId.trim()
    : null;
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
    masterCardId: card.masterCardId,
    ...(ext ? { externalId: ext } : {}),
    ...(legacyExternalId ? { legacyExternalId } : {}),
    set: card.setCode,
    setSlug: setMeta?.slug ?? undefined,
    setName: setMeta?.name ?? undefined,
    setTcgdexId: card.setTcgdexId ?? undefined,
    setCardCountOfficial:
      setMeta?.cardCountOfficial != null && setMeta.cardCountOfficial >= 0
        ? Math.floor(setMeta.cardCountOfficial)
        : undefined,
    setLogoSrc: setMeta?.logoSrc ?? undefined,
    setSymbolSrc: setMeta?.symbolSrc ?? undefined,
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

export function mapCustomerCollectionRow(row: Record<string, unknown>, conditionName?: string): StorefrontCardEntry | null {
  const masterCardId = typeof row.master_card_id === "string" ? row.master_card_id.trim() : "";
  if (!masterCardId) return null;

  const base = mapMasterCardId(masterCardId);
  if (!base) return null;

  const entryId = row.id != null ? String(row.id) : "";
  const conditionLabel = conditionName ?? "";
  const qty = typeof row.quantity === "number" && Number.isFinite(row.quantity) ? row.quantity : 1;
  const printing = typeof row.printing === "string" && row.printing.trim() ? row.printing.trim() : undefined;
  const language = typeof row.language === "string" && row.language.trim() ? row.language.trim() : undefined;
  const addedAt = typeof row.added_at === "string" && row.added_at ? row.added_at : undefined;

  return {
    ...base,
    ...(entryId ? { collectionEntryId: entryId } : {}),
    ...(conditionLabel ? { conditionLabel } : {}),
    ...(printing ? { printing } : {}),
    ...(language ? { language } : {}),
    ...(addedAt ? { addedAt } : {}),
    quantity: qty,
  };
}

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
 * One tile per catalog card: sums quantities across all rows for the same masterCardId.
 * Preserves first-seen order (newest first).
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

export function mapCustomerWishlistRow(row: Record<string, unknown>, conditionName?: string): StorefrontCardEntry | null {
  const masterCardId = typeof row.master_card_id === "string" ? row.master_card_id.trim() : "";
  if (!masterCardId) return null;

  const base = mapMasterCardId(masterCardId);
  if (!base) return null;

  const entryId = row.id != null ? String(row.id) : "";
  const pri = row.priority;
  const priority = pri === "low" || pri === "medium" || pri === "high" ? pri : undefined;
  const targetConditionId = typeof row.target_condition_id === "string" ? row.target_condition_id : undefined;
  const targetConditionName = conditionName ?? undefined;
  const targetPrinting = typeof row.target_printing === "string" ? row.target_printing : undefined;
  const addedAt = typeof row.added_at === "string" && row.added_at ? row.added_at : undefined;

  return {
    ...base,
    ...(entryId ? { wishlistEntryId: entryId } : {}),
    ...(priority ? { priority } : {}),
    ...(targetConditionId ? { targetConditionId } : {}),
    ...(targetConditionName ? { conditionLabel: targetConditionName } : {}),
    ...(targetPrinting ? { targetPrinting } : {}),
    ...(addedAt ? { addedAt } : {}),
  };
}

export async function fetchCollectionCardEntries(customerId: string): Promise<StorefrontCardEntry[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("customer_collections")
    .select("id, master_card_id, quantity, printing, language, added_at, condition_id")
    .eq("customer_id", customerId)
    .order("added_at", { ascending: false })
    .limit(2000);

  if (error || !data) return [];

  return data
    .map((row) => {
      const conditionName = getItemConditionName(row.condition_id as string | null);
      return mapCustomerCollectionRow(row as unknown as Record<string, unknown>, conditionName);
    })
    .filter((e): e is StorefrontCardEntry => Boolean(e));
}

export async function fetchWishlistCardEntries(customerId: string): Promise<StorefrontCardEntry[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("customer_wishlists")
    .select("id, master_card_id, priority, target_condition_id, target_printing, added_at")
    .eq("customer_id", customerId)
    .order("added_at", { ascending: false })
    .limit(2000);

  if (!data) return [];

  return data
    .map((row) => {
      const conditionName = getItemConditionName(row.target_condition_id as string | null);
      return mapCustomerWishlistRow(row as unknown as Record<string, unknown>, conditionName);
    })
    .filter((e): e is StorefrontCardEntry => Boolean(e));
}

export async function fetchWishlistIdsByMasterCard(
  customerId: string,
): Promise<Record<string, { id: string; printing?: string }>> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("customer_wishlists")
    .select("id, master_card_id, target_printing")
    .eq("customer_id", customerId)
    .limit(2000);

  const map: Record<string, { id: string; printing?: string }> = {};
  for (const row of data ?? []) {
    const mid = row.master_card_id as string;
    const wid = row.id as string;
    if (mid && wid && map[mid] === undefined) {
      map[mid] = {
        id: wid,
        printing: typeof row.target_printing === "string" ? row.target_printing : undefined,
      };
    }
  }
  return map;
}
