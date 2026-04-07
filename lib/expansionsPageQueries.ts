import { getAllSets } from "@/lib/staticCards";
import { getSinglesCatalogSetKey } from "@/lib/singlesCatalogSetKey";

export type ExpansionSetRow = {
  code: string;
  name: string;
  logoSrc: string;
  seriesName: string;
  /** `sets.cardCountTotal`, 0 when unknown. */
  totalCards: number;
  /** UTC ms for sorting (0 if no date). */
  releaseTime: number;
};

export type ExpansionSeriesGroup = {
  seriesName: string;
  sets: ExpansionSetRow[];
};

export function getCachedExpansionSetRows(): ExpansionSetRow[] {
  const rows: ExpansionSetRow[] = [];

  for (const s of getAllSets()) {
    const code = getSinglesCatalogSetKey(s);
    if (!code || !s.logoSrc) continue;

    const releaseTime = s.releaseDate ? new Date(s.releaseDate).getTime() : 0;

    rows.push({
      code,
      name: s.name || code,
      logoSrc: s.logoSrc,
      seriesName: s.seriesName || "Other",
      totalCards: typeof s.cardCountTotal === "number" && s.cardCountTotal > 0
        ? Math.floor(s.cardCountTotal)
        : 0,
      releaseTime: Number.isFinite(releaseTime) ? releaseTime : 0,
    });
  }

  return rows;
}

export function groupExpansionSetsBySeries(rows: ExpansionSetRow[]): ExpansionSeriesGroup[] {
  const bySeries = new Map<string, ExpansionSetRow[]>();
  for (const row of rows) {
    const list = bySeries.get(row.seriesName) ?? [];
    list.push(row);
    bySeries.set(row.seriesName, list);
  }

  for (const list of bySeries.values()) {
    list.sort(
      (a, b) =>
        b.releaseTime - a.releaseTime ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }

  const groups = [...bySeries.entries()].map(([seriesName, sets]) => ({ seriesName, sets }));

  groups.sort((a, b) => {
    const maxA = Math.max(0, ...a.sets.map((s) => s.releaseTime));
    const maxB = Math.max(0, ...b.sets.map((s) => s.releaseTime));
    if (maxA !== maxB) return maxB - maxA;
    return a.seriesName.localeCompare(b.seriesName, undefined, { sensitivity: "base" });
  });

  return groups;
}
