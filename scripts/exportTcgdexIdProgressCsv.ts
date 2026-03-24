import nextEnvImport from "@next/env";
import { writeFile } from "node:fs/promises";
import path from "node:path";

type SeriesRow = {
  id: string;
  name: string;
};

type SetRow = {
  id: string;
  name: string;
  tcgdexId: string;
  seriesId: string;
  seriesName: string;
};

type Coverage = {
  total: number;
  filled: number;
};

function percent(filled: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((filled / total) * 1000) / 10;
}

function status(total: number, filled: number): "completed" | "in_progress" | "no_cards" {
  if (total === 0) return "no_cards";
  if (filled === total) return "completed";
  return "in_progress";
}

function csvEscape(value: string | number): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replaceAll("\"", "\"\"")}"`;
  }
  return str;
}

function toCsvLine(values: Array<string | number>): string {
  return values.map(csvEscape).join(",");
}

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    const seriesResult = await payload.find({
      collection: "series",
      limit: 1000,
      depth: 0,
      overrideAccess: true,
      select: { id: true, name: true },
    });

    const seriesRows: SeriesRow[] = seriesResult.docs.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
    }));
    const seriesNameById = new Map(seriesRows.map((row) => [row.id, row.name]));

    const setsResult = await payload.find({
      collection: "sets",
      limit: 5000,
      depth: 0,
      overrideAccess: true,
      select: { id: true, name: true, tcgdexId: true, serieName: true },
    });

    const setRows: SetRow[] = setsResult.docs.map((row) => {
      const seriesId =
        typeof row.serieName === "object" && row.serieName && "id" in row.serieName
          ? String(row.serieName.id)
          : row.serieName != null
            ? String(row.serieName)
            : "";
      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        tcgdexId: typeof row.tcgdexId === "string" ? row.tcgdexId.trim() : "",
        seriesId,
        seriesName: seriesNameById.get(seriesId) ?? "Unassigned",
      };
    });

    const cardsResult = await payload.find({
      collection: "master-card-list",
      limit: 10000,
      depth: 0,
      overrideAccess: true,
      select: { id: true, set: true, tcgdex_id: true },
    });

    const setCoverage = new Map<string, Coverage>();
    for (const card of cardsResult.docs) {
      const setId =
        typeof card.set === "object" && card.set && "id" in card.set
          ? String(card.set.id)
          : card.set != null
            ? String(card.set)
            : "";
      if (!setId) continue;
      const current = setCoverage.get(setId) ?? { total: 0, filled: 0 };
      current.total += 1;
      if (typeof card.tcgdex_id === "string" && card.tcgdex_id.trim()) {
        current.filled += 1;
      }
      setCoverage.set(setId, current);
    }

    const seriesCoverage = new Map<string, Coverage>();
    for (const set of setRows) {
      const cov = setCoverage.get(set.id) ?? { total: 0, filled: 0 };
      const current = seriesCoverage.get(set.seriesName) ?? { total: 0, filled: 0 };
      current.total += cov.total;
      current.filled += cov.filled;
      seriesCoverage.set(set.seriesName, current);
    }

    const generatedAt = new Date().toISOString();

    const seriesLines: string[] = [
      toCsvLine([
        "generated_at_utc",
        "series_name",
        "set_count",
        "cards_total",
        "cards_filled",
        "cards_blank",
        "percent_filled",
        "status",
      ]),
    ];

    const setCountBySeries = new Map<string, number>();
    for (const set of setRows) {
      setCountBySeries.set(set.seriesName, (setCountBySeries.get(set.seriesName) ?? 0) + 1);
    }

    const sortedSeriesNames = Array.from(seriesCoverage.keys()).sort((a, b) => a.localeCompare(b));
    for (const seriesName of sortedSeriesNames) {
      const cov = seriesCoverage.get(seriesName) ?? { total: 0, filled: 0 };
      const blank = cov.total - cov.filled;
      const pct = percent(cov.filled, cov.total);
      seriesLines.push(
        toCsvLine([
          generatedAt,
          seriesName,
          setCountBySeries.get(seriesName) ?? 0,
          cov.total,
          cov.filled,
          blank,
          pct,
          status(cov.total, cov.filled),
        ]),
      );
    }

    const setLines: string[] = [
      toCsvLine([
        "generated_at_utc",
        "series_name",
        "set_name",
        "set_tcgdex_id",
        "cards_total",
        "cards_filled",
        "cards_blank",
        "percent_filled",
        "status",
      ]),
    ];

    const sortedSets = [...setRows].sort((a, b) => {
      const bySeries = a.seriesName.localeCompare(b.seriesName);
      if (bySeries !== 0) return bySeries;
      return a.name.localeCompare(b.name);
    });
    for (const set of sortedSets) {
      const cov = setCoverage.get(set.id) ?? { total: 0, filled: 0 };
      const blank = cov.total - cov.filled;
      setLines.push(
        toCsvLine([
          generatedAt,
          set.seriesName,
          set.name,
          set.tcgdexId,
          cov.total,
          cov.filled,
          blank,
          percent(cov.filled, cov.total),
          status(cov.total, cov.filled),
        ]),
      );
    }

    const outDir = path.join(process.cwd(), "docs");
    const seriesPath = path.join(outDir, "tcgdex-id-progress-series.csv");
    const setsPath = path.join(outDir, "tcgdex-id-progress-sets.csv");

    await writeFile(seriesPath, `${seriesLines.join("\n")}\n`, "utf8");
    await writeFile(setsPath, `${setLines.join("\n")}\n`, "utf8");

    console.log(
      JSON.stringify(
        {
          ok: true,
          generatedAt,
          files: {
            series: seriesPath,
            sets: setsPath,
          },
          counts: {
            seriesRows: sortedSeriesNames.length,
            setRows: sortedSets.length,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
