import type { CardsPageCardEntry } from "@/lib/cardsPageQueries";
import { resolveMediaURL } from "@/lib/media";
import { getCardMapById } from "@/lib/staticCardIndex";
import { getAllSets } from "@/lib/staticCards";
import { isGradedConditionId, isGradedConditionLabel, ITEM_CONDITIONS } from "@/lib/referenceData";

export type StorefrontCardExtras = {
  /** Stable key for collection line(s): variant + condition + grade. Set on merged collection grid rows. */
  collectionGroupKey?: string;
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
  conditionId?: string;
  /** How the copy was obtained (DB `purchase_type`). */
  purchaseType?: "packed" | "bought" | "traded";
  /** GBP paid when `purchaseType` is `bought` (DB `price_paid`). */
  pricePaid?: number;
  unlistedPrice?: number;
  gradingCompany?: string;
  gradeValue?: string;
  gradedImageUrl?: string;
  gradedSerial?: string;
};

export type CollectionLineSummary = {
  entryId: string;
  quantity: number;
  conditionId?: string;
  conditionLabel: string;
  printing: string;
  language: string;
  addedAt?: string;
  gradingCompany?: string;
  gradeValue?: string;
  purchaseType?: "packed" | "bought" | "traded";
  pricePaid?: number;
  unlistedPrice?: number;
  gradedImageUrl?: string;
  gradedSerial?: string;
};

export type WishlistEntrySummary = {
  id: string;
  printing?: string;
};

export type WishlistEntriesByMasterCardId = Record<string, WishlistEntrySummary[]>;

export type StorefrontCardEntry = CardsPageCardEntry & StorefrontCardExtras;

/** Whole-copy count for a collection row or merged tile (matches grid ×N and merge totals). */
export function collectionLineQuantity(e: Pick<StorefrontCardEntry, "quantity">): number {
  const q = e.quantity;
  if (typeof q === "number" && Number.isFinite(q) && q >= 1) return Math.max(1, Math.floor(q));
  return 1;
}

/** Sum of whole-copy counts from raw DB rows (before merge). */
export function collectionCopyTotalFromEntries(entries: StorefrontCardEntry[]): number {
  return entries.reduce((sum, e) => sum + collectionLineQuantity(e), 0);
}

export function getMasterCardCopyTotals(
  entries: Pick<StorefrontCardEntry, "masterCardId" | "quantity">[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    const masterCardId = entry.masterCardId?.trim() ?? "";
    if (!masterCardId) continue;
    totals[masterCardId] = (totals[masterCardId] ?? 0) + collectionLineQuantity(entry);
  }
  return totals;
}

export function getMasterCardIdsWithMinCopies(
  entries: Pick<StorefrontCardEntry, "masterCardId" | "quantity">[],
  minCopies = 2,
): Set<string> {
  if (!Number.isFinite(minCopies) || minCopies <= 1) {
    return new Set(Object.keys(getMasterCardCopyTotals(entries)));
  }

  const totals = getMasterCardCopyTotals(entries);
  return new Set(
    Object.entries(totals)
      .filter(([, total]) => total >= minCopies)
      .map(([masterCardId]) => masterCardId),
  );
}

/** Sum of {@link collectionLineQuantity} on merged grid rows — matches sum of copy counts shown on tiles (×N). */
export function totalCopiesFromMergedGrid(merged: StorefrontCardEntry[]): number {
  return merged.reduce((sum, row) => sum + collectionLineQuantity(row), 0);
}

/** Invariant: merging by variant+condition does not change total copy count. */
export function collectionCopyTotalsMatch(entries: StorefrontCardEntry[], merged: StorefrontCardEntry[]): boolean {
  return collectionCopyTotalFromEntries(entries) === totalCopiesFromMergedGrid(merged);
}

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
  const conditionId = typeof row.condition_id === "string" && row.condition_id.trim() ? row.condition_id.trim() : undefined;
  const conditionLabel = conditionName ?? "";
  const qty = typeof row.quantity === "number" && Number.isFinite(row.quantity) ? row.quantity : 1;
  const printing = typeof row.printing === "string" && row.printing.trim() ? row.printing.trim() : undefined;
  const language = typeof row.language === "string" && row.language.trim() ? row.language.trim() : undefined;
  const addedAt = typeof row.added_at === "string" && row.added_at ? row.added_at : undefined;
  const ptRaw = row.purchase_type;
  const purchaseType =
    ptRaw === "packed" || ptRaw === "bought" || ptRaw === "traded" ? ptRaw : undefined;
  const pricePaid =
    typeof row.price_paid === "number" && Number.isFinite(row.price_paid) && row.price_paid >= 0
      ? row.price_paid
      : undefined;
  const unlistedPrice = typeof row.unlisted_price === "number" && Number.isFinite(row.unlisted_price) ? row.unlisted_price : undefined;
  const gradingCompany = typeof row.grading_company === "string" && row.grading_company && row.grading_company !== "none" ? row.grading_company : undefined;
  const gradeValue = typeof row.grade_value === "string" && row.grade_value ? row.grade_value : undefined;
  const gradedImageRaw = typeof row.graded_image === "string" && row.graded_image ? row.graded_image : undefined;
  const gradedImageUrl = gradedImageRaw ? resolveMediaURL(gradedImageRaw) : undefined;
  const gradedSerial = typeof row.graded_serial === "string" && row.graded_serial.trim() ? row.graded_serial.trim() : undefined;

  return {
    ...base,
    ...(entryId ? { collectionEntryId: entryId } : {}),
    ...(conditionId ? { conditionId } : {}),
    ...(conditionLabel ? { conditionLabel } : {}),
    ...(printing ? { printing } : {}),
    ...(language ? { language } : {}),
    ...(addedAt ? { addedAt } : {}),
    ...(purchaseType !== undefined ? { purchaseType } : {}),
    ...(pricePaid !== undefined ? { pricePaid } : {}),
    ...(unlistedPrice !== undefined ? { unlistedPrice } : {}),
    ...(gradingCompany !== undefined ? { gradingCompany } : {}),
    ...(gradeValue !== undefined ? { gradeValue } : {}),
    ...(gradedImageUrl !== undefined ? { gradedImageUrl } : {}),
    ...(gradedSerial !== undefined ? { gradedSerial } : {}),
    quantity: qty,
  };
}

/** Groups lines by catalog card + printing + condition + grade (not by master id alone). */
export function collectionGroupKeyFromEntry(
  e: Pick<
    StorefrontCardEntry,
    "masterCardId" | "conditionLabel" | "printing" | "language" | "gradingCompany" | "gradeValue" | "targetPrinting"
  >,
): string {
  const mid = e.masterCardId?.trim() ?? "";
  const printing = e.printing?.trim() || e.targetPrinting?.trim() || "Standard";
  const conditionLabel = e.conditionLabel?.trim() ? e.conditionLabel.trim() : "—";
  const language = e.language?.trim() ? e.language.trim() : "English";
  const gc = e.gradingCompany?.trim() ?? "";
  const gv = e.gradeValue?.trim() ?? "";
  return `${mid}|${printing}|${conditionLabel}|${language}|${gc}|${gv}`;
}

export function collectionGroupKeyFromLine(
  masterCardId: string,
  line: Pick<CollectionLineSummary, "conditionLabel" | "printing" | "language" | "gradingCompany" | "gradeValue">,
): string {
  const mid = masterCardId.trim();
  const printing = line.printing?.trim() ? line.printing.trim() : "Standard";
  const conditionLabel = line.conditionLabel?.trim() ? line.conditionLabel.trim() : "—";
  const language = line.language?.trim() ? line.language.trim() : "English";
  const gc = line.gradingCompany?.trim() ?? "";
  const gv = line.gradeValue?.trim() ?? "";
  return `${mid}|${printing}|${conditionLabel}|${language}|${gc}|${gv}`;
}

/** True if this collection line is a graded/slab entry (not a raw single). */
export function isGradedCollectionEntry(
  entry: Pick<StorefrontCardEntry, "gradingCompany" | "gradeValue" | "conditionId" | "conditionLabel">,
): boolean {
  if ((entry.gradingCompany?.trim() ?? "") && (entry.gradeValue?.trim() ?? "")) return true;
  if (isGradedConditionId(entry.conditionId)) return true;
  return isGradedConditionLabel(entry.conditionLabel);
}

/** Product type slug for `account_transactions` when logging a collection sale. */
export function accountTransactionProductTypeSlugForCollectionLine(
  line: Pick<CollectionLineSummary, "conditionId" | "conditionLabel" | "gradingCompany" | "gradeValue">,
): "graded-card" | "single-card" {
  return isGradedCollectionEntry(line) ? "graded-card" : "single-card";
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
      ...(e.conditionId ? { conditionId: e.conditionId } : {}),
      conditionLabel: e.conditionLabel?.trim() ? e.conditionLabel.trim() : "—",
      printing: e.printing?.trim() ? e.printing.trim() : "Standard",
      language: e.language?.trim() ? e.language.trim() : "English",
      ...(e.addedAt ? { addedAt: e.addedAt } : {}),
      ...(e.gradingCompany ? { gradingCompany: e.gradingCompany } : {}),
      ...(e.gradeValue ? { gradeValue: e.gradeValue } : {}),
      ...(e.purchaseType ? { purchaseType: e.purchaseType } : {}),
      ...(e.pricePaid !== undefined ? { pricePaid: e.pricePaid } : {}),
      ...(e.unlistedPrice !== undefined ? { unlistedPrice: e.unlistedPrice } : {}),
      ...(e.gradedImageUrl ? { gradedImageUrl: e.gradedImageUrl } : {}),
      ...(e.gradedSerial ? { gradedSerial: e.gradedSerial } : {}),
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

/** Same as {@link groupCollectionLinesByMasterCardId}, but map keys are {@link collectionGroupKeyFromEntry} (variant + condition + grade). */
export function groupCollectionLinesByGroupKey(
  entries: StorefrontCardEntry[],
): Record<string, CollectionLineSummary[]> {
  const map: Record<string, CollectionLineSummary[]> = {};
  for (const e of entries) {
    const mid = e.masterCardId;
    const entryId = e.collectionEntryId;
    if (!mid || !entryId) continue;
    const gk = collectionGroupKeyFromEntry(e);
    const line: CollectionLineSummary = {
      entryId,
      quantity: typeof e.quantity === "number" && Number.isFinite(e.quantity) && e.quantity >= 1 ? e.quantity : 1,
      ...(e.conditionId ? { conditionId: e.conditionId } : {}),
      conditionLabel: e.conditionLabel?.trim() ? e.conditionLabel.trim() : "—",
      printing: e.printing?.trim() ? e.printing.trim() : "Standard",
      language: e.language?.trim() ? e.language.trim() : "English",
      ...(e.addedAt ? { addedAt: e.addedAt } : {}),
      ...(e.gradingCompany ? { gradingCompany: e.gradingCompany } : {}),
      ...(e.gradeValue ? { gradeValue: e.gradeValue } : {}),
      ...(e.purchaseType ? { purchaseType: e.purchaseType } : {}),
      ...(e.pricePaid !== undefined ? { pricePaid: e.pricePaid } : {}),
      ...(e.unlistedPrice !== undefined ? { unlistedPrice: e.unlistedPrice } : {}),
      ...(e.gradedImageUrl ? { gradedImageUrl: e.gradedImageUrl } : {}),
      ...(e.gradedSerial ? { gradedSerial: e.gradedSerial } : {}),
    };
    if (!map[gk]) map[gk] = [];
    map[gk].push(line);
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
 * Collection grid tiles group raw copies by catalog card while keeping graded copies separate.
 * Detailed per-variant / per-condition lines remain available via {@link groupCollectionLinesByMasterCardId}.
 * Preserves first-seen order of tile keys (newest first).
 */
export function mergeCollectionEntriesForGrid(entries: StorefrontCardEntry[]): StorefrontCardEntry[] {
  const keyOrder: string[] = [];
  const seenKey = new Set<string>();
  const byKey = new Map<string, StorefrontCardEntry[]>();

  for (const e of entries) {
    const mid = e.masterCardId;
    if (!mid) {
      continue;
    }
    const tileKey = isGradedCollectionEntry(e) ? collectionGroupKeyFromEntry(e) : mid;
    if (!seenKey.has(tileKey)) {
      seenKey.add(tileKey);
      keyOrder.push(tileKey);
    }
    const list = byKey.get(tileKey) ?? [];
    list.push(e);
    byKey.set(tileKey, list);
  }

  const out: StorefrontCardEntry[] = [];
  for (const key of keyOrder) {
    const group = byKey.get(key);
    if (!group?.length) continue;
    const first = group[0]!;
    let total = 0;
    for (const x of group) {
      total += collectionLineQuantity(x);
    }
    out.push({
      ...first,
      quantity: total,
      collectionGroupKey: isGradedCollectionEntry(first) ? key : undefined,
      collectionEntryId: group.length === 1 ? first.collectionEntryId : undefined,
    });
  }

  return out;
}

/**
 * One grid row per collection line (not merged), so each tile has a stable {@link StorefrontCardEntry.collectionEntryId}
 * for trade selection.
 */
export function storefrontEntriesToTradeGridCards(entries: StorefrontCardEntry[]): StorefrontCardEntry[] {
  const out: StorefrontCardEntry[] = [];
  for (const e of entries) {
    if (!e.masterCardId || !e.collectionEntryId) continue;
    out.push({
      ...e,
      collectionGroupKey: collectionGroupKeyFromEntry(e),
      quantity: collectionLineQuantity(e),
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
