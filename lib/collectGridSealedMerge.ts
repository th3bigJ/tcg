import type { CardEntry } from "@/components/CardGrid";
import type { CollectGridSealedRow, CollectMergedFlatRow } from "@/lib/collectGridSealed";

type SortOrder = "price-desc" | "price-asc" | "release-desc" | "release-asc" | "number-desc" | "number-asc" | "added-desc";

export type CollectUnifiedSection =
  | {
      kind: "set";
      setCode: string;
      entries: { card: CardEntry; globalIndex: number }[];
      sortDate: string;
    }
  | {
      kind: "sealedSeries";
      title: string;
      rows: CollectGridSealedRow[];
      sortDate: string;
    };

function getCardPriceForMerge(
  card: CardEntry,
  sortOrder: SortOrder,
  variant: "collection" | "wishlist",
  cardPricesByMasterCardId: Record<string, number>,
  effectiveCollectionPriceRangeByMasterCardId: Record<string, { low: number; high: number }>,
): number {
  const k = card.collectionGroupKey ?? card.masterCardId ?? "";
  if (k && cardPricesByMasterCardId[k] !== undefined) return cardPricesByMasterCardId[k] ?? 0;
  if (variant === "collection" && card.masterCardId) {
    const range = effectiveCollectionPriceRangeByMasterCardId[card.masterCardId];
    if (!range) return 0;
    return sortOrder === "price-asc" ? range.low : range.high;
  }
  return 0;
}

export function mergeFlatCardAndSealedRows(
  cards: CardEntry[],
  sealed: CollectGridSealedRow[],
  sortOrder: SortOrder,
  variant: "collection" | "wishlist",
  cardPricesByMasterCardId: Record<string, number>,
  effectiveCollectionPriceRangeByMasterCardId: Record<string, { low: number; high: number }>,
): CollectMergedFlatRow[] {
  if (sealed.length === 0) {
    return cards.map((_, cardIndex) => ({ kind: "card" as const, cardIndex }));
  }

  type Tagged =
    | { kind: "card"; cardIndex: number; sortKey: string | number }
    | { kind: "sealed"; row: CollectGridSealedRow; sortKey: string | number };

  const tagged: Tagged[] = [];

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    const card = cards[cardIndex]!;
    let sortKey: string | number;
    switch (sortOrder) {
      case "price-desc":
      case "price-asc":
        sortKey = getCardPriceForMerge(
          card,
          sortOrder,
          variant,
          cardPricesByMasterCardId,
          effectiveCollectionPriceRangeByMasterCardId,
        );
        break;
      case "release-desc":
      case "release-asc":
        sortKey = card.setReleaseDate ?? "";
        break;
      case "number-desc":
      case "number-asc":
        sortKey = card.cardNumber ?? "";
        break;
      case "added-desc":
        sortKey = (card as { addedAt?: string }).addedAt ?? "";
        break;
      default:
        sortKey = "";
    }
    tagged.push({ kind: "card", cardIndex, sortKey });
  }

  for (const row of sealed) {
    let sortKey: string | number;
    switch (sortOrder) {
      case "price-desc":
      case "price-asc":
        sortKey = row.priceSortGbp;
        break;
      case "release-desc":
      case "release-asc":
        sortKey = row.releaseDate ?? "";
        break;
      case "number-desc":
      case "number-asc":
        sortKey = row.name ?? "";
        break;
      case "added-desc":
        sortKey = row.addedAt ?? "";
        break;
      default:
        sortKey = "";
    }
    tagged.push({ kind: "sealed", row, sortKey });
  }

  const compare = (a: Tagged, b: Tagged): number => {
    switch (sortOrder) {
      case "price-desc": {
        const na = a.kind === "card" ? Number(a.sortKey) : a.kind === "sealed" ? a.row.priceSortGbp : 0;
        const nb = b.kind === "card" ? Number(b.sortKey) : b.kind === "sealed" ? b.row.priceSortGbp : 0;
        return nb - na;
      }
      case "price-asc": {
        const na = a.kind === "card" ? Number(a.sortKey) : a.kind === "sealed" ? a.row.priceSortGbp : 0;
        const nb = b.kind === "card" ? Number(b.sortKey) : b.kind === "sealed" ? b.row.priceSortGbp : 0;
        return na - nb;
      }
      case "release-desc":
        return String(b.sortKey).localeCompare(String(a.sortKey));
      case "release-asc":
        return String(a.sortKey).localeCompare(String(b.sortKey));
      case "number-desc":
        return String(b.sortKey).localeCompare(String(a.sortKey), undefined, { numeric: true });
      case "number-asc":
        return String(a.sortKey).localeCompare(String(b.sortKey), undefined, { numeric: true });
      case "added-desc":
        return String(b.sortKey).localeCompare(String(a.sortKey));
      default:
        return 0;
    }
  };

  tagged.sort(compare);

  return tagged.map((t): CollectMergedFlatRow => {
    if (t.kind === "card") return { kind: "card", cardIndex: t.cardIndex };
    return { kind: "sealed", row: t.row };
  });
}

export function buildUnifiedCardAndSealedSections(
  cards: CardEntry[],
  sealed: CollectGridSealedRow[],
  groupShuffleSeed: number | undefined,
): CollectUnifiedSection[] {
  type GroupEntry = { card: CardEntry; globalIndex: number };
  const groupOrder: string[] = [];
  const groupMap: Record<string, GroupEntry[]> = {};
  cards.forEach((card, globalIndex) => {
    const code = card.set;
    if (!groupMap[code]) {
      groupOrder.push(code);
      groupMap[code] = [];
    }
    groupMap[code]!.push({ card, globalIndex });
  });

  if (groupShuffleSeed !== undefined) {
    let s = groupShuffleSeed;
    for (let i = groupOrder.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      const j = Math.abs(s) % (i + 1);
      [groupOrder[i], groupOrder[j]] = [groupOrder[j]!, groupOrder[i]!];
    }
    for (const code of groupOrder) {
      groupMap[code]!.sort((a, b) =>
        (b.card.cardNumber || "").localeCompare(a.card.cardNumber || "", undefined, { numeric: true }),
      );
    }
  } else {
    groupOrder.sort((a, b) => {
      const dateA = groupMap[a]?.[0]?.card.setReleaseDate ?? "";
      const dateB = groupMap[b]?.[0]?.card.setReleaseDate ?? "";
      return dateB.localeCompare(dateA);
    });
  }

  const setSections: CollectUnifiedSection[] = groupOrder.map((setCode) => {
    const entries = groupMap[setCode] ?? [];
    const sortDate = entries[0]?.card.setReleaseDate ?? "";
    return { kind: "set", setCode, entries, sortDate };
  });

  const sealedByKey = new Map<string, CollectGridSealedRow[]>();
  for (const row of sealed) {
    const title = row.series?.trim() || "Other sealed";
    const key = title.toLowerCase();
    const list = sealedByKey.get(key) ?? [];
    list.push(row);
    sealedByKey.set(key, list);
  }

  const sealedSections: CollectUnifiedSection[] = [...sealedByKey.entries()].map(([, rows]) => {
    const title = rows[0]?.series?.trim() || "Other sealed";
    let sortDate = "";
    for (const r of rows) {
      const d = r.releaseDate ?? "";
      if (d > sortDate) sortDate = d;
    }
    return { kind: "sealedSeries", title, rows, sortDate };
  });

  return [...setSections, ...sealedSections].sort((a, b) => b.sortDate.localeCompare(a.sortDate));
}
