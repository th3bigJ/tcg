import { unstable_cache } from "next/cache";

import { resolveMediaURL } from "@/lib/media";
import { resolveCanonicalSetCodeFromFields } from "@/lib/setCanonicalCode";

export type ExpansionSetRow = {
  code: string;
  name: string;
  logoSrc: string;
  seriesName: string;
  /** `sets.cardCountTotal` (DB column `card_count_total`), 0 when unknown. */
  totalCards: number;
  /** UTC ms for sorting (0 if no date). */
  releaseTime: number;
};

type ImageRelation = {
  url?: string | null;
};

const isImageRelation = (value: unknown): value is ImageRelation =>
  Boolean(value) && typeof value === "object";

async function loadExpansionSetRows(): Promise<ExpansionSetRow[]> {
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const result = await payload.find({
    collection: "sets",
    depth: 1,
    limit: 2000,
    page: 1,
    overrideAccess: true,
    select: {
      code: true,
      tcgdexId: true,
      name: true,
      setImage: true,
      releaseDate: true,
      serieName: true,
      cardCountTotal: true,
      isActive: true,
    },
    where: {
      and: [
        { isActive: { equals: true } },
        {
          or: [{ tcgdexId: { exists: true } }, { code: { exists: true } }],
        },
        { setImage: { exists: true } },
      ],
    },
    sort: "-releaseDate",
  });

  const rows: ExpansionSetRow[] = [];

  for (const doc of result.docs) {
    const code = resolveCanonicalSetCodeFromFields({
      tcgdexId: doc.tcgdexId,
      code: doc.code,
    });
    if (!code) continue;
    const name = typeof doc.name === "string" ? doc.name.trim() : code;
    const image = isImageRelation(doc.setImage) ? doc.setImage : null;
    const imageUrl = typeof image?.url === "string" ? image.url : "";
    if (!imageUrl) continue;

    const seriesName =
      typeof doc.serieName === "object" &&
      doc.serieName &&
      "name" in doc.serieName &&
      typeof doc.serieName.name === "string"
        ? doc.serieName.name.trim()
        : "Other";

    const releaseRaw = typeof doc.releaseDate === "string" ? doc.releaseDate : "";
    const releaseTime = releaseRaw ? new Date(releaseRaw).getTime() : 0;
    const totalCardsRaw =
      typeof doc.cardCountTotal === "number" && Number.isFinite(doc.cardCountTotal)
        ? doc.cardCountTotal
        : 0;
    const totalCards = totalCardsRaw > 0 ? Math.floor(totalCardsRaw) : 0;

    rows.push({
      code,
      name,
      logoSrc: resolveMediaURL(imageUrl),
      seriesName: seriesName || "Other",
      totalCards,
      releaseTime: Number.isFinite(releaseTime) ? releaseTime : 0,
    });
  }

  return rows;
}

export type ExpansionSeriesGroup = {
  seriesName: string;
  sets: ExpansionSetRow[];
};

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
        b.releaseTime - a.releaseTime || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
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

export const getCachedExpansionSetRows = unstable_cache(
  async () => loadExpansionSetRows(),
  ["public-expansions-set-rows-v2"],
  { revalidate: 300 },
);
