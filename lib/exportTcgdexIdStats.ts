/**
 * Shared helpers to write `docs/tcgdex-id-by-series.*` and `docs/tcgdex-id-by-set.*`
 * from current master-card-list + sets + series data.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { Payload } from "payload";

type SeriesRow = {
  id: string;
  name: string;
};

type SetRow = {
  id: string;
  name: string;
  tcgdexId: string;
  seriesName: string;
};

type Coverage = {
  total: number;
  withTcgdexId: number;
};

function percent(filled: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((filled / total) * 1000) / 10;
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

async function findAllMasterCardSnapshots(
  payload: Payload,
): Promise<Array<{ setId: string; hasTcgdexId: boolean }>> {
  const pageSize = 500;
  let page = 1;
  const snapshots: Array<{ setId: string; hasTcgdexId: boolean }> = [];

  while (true) {
    const result = await payload.find({
      collection: "master-card-list",
      limit: pageSize,
      page,
      depth: 0,
      overrideAccess: true,
      select: { id: true, set: true, tcgdex_id: true },
    });

    for (const card of result.docs) {
      const setId =
        typeof card.set === "object" && card.set && "id" in card.set
          ? String(card.set.id)
          : card.set != null
            ? String(card.set)
            : "";
      if (!setId) continue;
      const hasTcgdexId =
        typeof card.tcgdex_id === "string" && card.tcgdex_id.trim().length > 0;
      snapshots.push({ setId, hasTcgdexId });
    }

    if (result.docs.length < pageSize) break;
    page += 1;
  }

  return snapshots;
}

async function loadSeriesAndSetRows(payload: Payload): Promise<{
  setRows: SetRow[];
}> {
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
    const tcgdexId = typeof row.tcgdexId === "string" ? row.tcgdexId.trim() : "";
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      tcgdexId,
      seriesName: seriesNameById.get(seriesId) ?? "Unassigned",
    };
  });

  return { setRows };
}

export type WriteTcgdexIdProgressOptions = {
  /** Write `docs/tcgdex-id-by-series.md` + `.csv` */
  series?: boolean;
  /** Write `docs/tcgdex-id-by-set.md` + `.csv` */
  sets?: boolean;
};

export type WriteTcgdexIdProgressResult = {
  generatedAt: string;
  paths: {
    seriesMarkdown?: string;
    seriesCsv?: string;
    setMarkdown?: string;
    setCsv?: string;
  };
};

/**
 * Regenerates progress markdown/CSV from the database. Used by the export script
 * and after each set scan in `populateMegaEvolutionTcgdexIdExact.ts`.
 */
export async function writeTcgdexIdProgressFiles(
  payload: Payload,
  options: WriteTcgdexIdProgressOptions = {},
): Promise<WriteTcgdexIdProgressResult> {
  const { series: writeSeries = true, sets: writeSets = true } = options;

  const { setRows } = await loadSeriesAndSetRows(payload);
  const snapshots = await findAllMasterCardSnapshots(payload);

  const setCoverage = new Map<string, Coverage>();
  for (const snap of snapshots) {
    const current = setCoverage.get(snap.setId) ?? { total: 0, withTcgdexId: 0 };
    current.total += 1;
    if (snap.hasTcgdexId) current.withTcgdexId += 1;
    setCoverage.set(snap.setId, current);
  }

  const seriesCoverage = new Map<string, Coverage>();
  for (const setRow of setRows) {
    const cov = setCoverage.get(setRow.id) ?? { total: 0, withTcgdexId: 0 };
    const current = seriesCoverage.get(setRow.seriesName) ?? { total: 0, withTcgdexId: 0 };
    current.total += cov.total;
    current.withTcgdexId += cov.withTcgdexId;
    seriesCoverage.set(setRow.seriesName, current);
  }

  const generatedAt = new Date().toISOString();
  const outDir = path.join(process.cwd(), "docs");
  const paths: WriteTcgdexIdProgressResult["paths"] = {};

  if (writeSeries) {
    const sortedNames = Array.from(seriesCoverage.keys()).sort((a, b) => a.localeCompare(b));
    let grandTotal = 0;
    let grandWith = 0;

    const mdLines: string[] = [
      "# TCGdex ID coverage by series",
      "",
      `Generated at (UTC): **${generatedAt}**`,
      "",
      "Counts are from **master-card-list** rows linked to sets in each series. **With tcgdex_id** means the field is non-empty (canonical id, including when `no_pricing` is true).",
      "",
      "| Series | Total cards | With tcgdex_id | Without | % with |",
      "| --- | ---: | ---: | ---: | ---: |",
    ];

    const csvLines: string[] = [
      toCsvLine([
        "generated_at_utc",
        "series_name",
        "cards_total",
        "cards_with_tcgdex_id",
        "cards_without_tcgdex_id",
        "percent_with_tcgdex_id",
      ]),
    ];

    for (const name of sortedNames) {
      const cov = seriesCoverage.get(name) ?? { total: 0, withTcgdexId: 0 };
      if (cov.total <= 0) {
        continue;
      }
      const without = cov.total - cov.withTcgdexId;
      const pct = percent(cov.withTcgdexId, cov.total);
      grandTotal += cov.total;
      grandWith += cov.withTcgdexId;

      mdLines.push(
        `| ${name.replaceAll("|", "\\|")} | ${cov.total} | ${cov.withTcgdexId} | ${without} | ${pct} |`,
      );
      csvLines.push(
        toCsvLine([generatedAt, name, cov.total, cov.withTcgdexId, without, pct]),
      );
    }

    const grandWithout = grandTotal - grandWith;
    const grandPct = percent(grandWith, grandTotal);
    mdLines.push(
      "",
      "## Total (all series above)",
      "",
      "| | Total cards | With tcgdex_id | Without | % with |",
      "| --- | ---: | ---: | ---: | ---: |",
      `| **All** | ${grandTotal} | ${grandWith} | ${grandWithout} | ${grandPct} |`,
      "",
    );

    csvLines.push(
      toCsvLine([
        generatedAt,
        "ALL_SERIES",
        grandTotal,
        grandWith,
        grandWithout,
        grandPct,
      ]),
    );

    const mdPath = path.join(outDir, "tcgdex-id-by-series.md");
    const csvPath = path.join(outDir, "tcgdex-id-by-series.csv");
    await writeFile(mdPath, `${mdLines.join("\n")}\n`, "utf8");
    await writeFile(csvPath, `${csvLines.join("\n")}\n`, "utf8");
    paths.seriesMarkdown = mdPath;
    paths.seriesCsv = csvPath;
  }

  if (writeSets) {
    const sortedSets = [...setRows].sort((a, b) => {
      const bySeries = a.seriesName.localeCompare(b.seriesName);
      if (bySeries !== 0) return bySeries;
      return a.name.localeCompare(b.name);
    });

    const perSetMarkdownLines: string[] = [
      "# TCGdex ID coverage by set (not 100%)",
      "",
      `Generated at (UTC): **${generatedAt}**`,
      "",
      "Counts are from **master-card-list** rows per set. Only sets where `% with tcgdex_id` is less than 100 are listed. **With tcgdex_id** means the field is non-empty (canonical id). **set_tcgdex_id** is the canonical set id on the set record.",
      "",
      "| Series | Set name | set_tcgdex_id | Total cards | With tcgdex_id | Without | % with |",
      "| --- | --- | --- | ---: | ---: | ---: | ---: |",
    ];

    const perSetCsvLines: string[] = [
      toCsvLine([
        "generated_at_utc",
        "series_name",
        "set_name",
        "set_tcgdex_id",
        "cards_total",
        "cards_with_tcgdex_id",
        "cards_without_tcgdex_id",
        "percent_with_tcgdex_id",
      ]),
    ];

    let setGrandTotal = 0;
    let setGrandWith = 0;

    for (const setRow of sortedSets) {
      const cov = setCoverage.get(setRow.id) ?? { total: 0, withTcgdexId: 0 };
      if (cov.total <= 0) {
        continue;
      }
      const without = cov.total - cov.withTcgdexId;
      const pct = percent(cov.withTcgdexId, cov.total);
      if (pct >= 100) {
        continue;
      }
      setGrandTotal += cov.total;
      setGrandWith += cov.withTcgdexId;

      const esc = (s: string) => s.replaceAll("|", "\\|");
      const setTcgdexForMd = setRow.tcgdexId || "\u2014";
      perSetMarkdownLines.push(
        `| ${esc(setRow.seriesName)} | ${esc(setRow.name)} | ${esc(setTcgdexForMd)} | ${cov.total} | ${cov.withTcgdexId} | ${without} | ${pct} |`,
      );
      perSetCsvLines.push(
        toCsvLine([
          generatedAt,
          setRow.seriesName,
          setRow.name,
          setRow.tcgdexId,
          cov.total,
          cov.withTcgdexId,
          without,
          pct,
        ]),
      );
    }

    const setGrandWithout = setGrandTotal - setGrandWith;
    const setGrandPct = percent(setGrandWith, setGrandTotal);
    perSetMarkdownLines.push(
      "",
      "## Total (listed sets only)",
      "",
      "| | | | Total cards | With tcgdex_id | Without | % with |",
      "| --- | --- | --- | ---: | ---: | ---: | ---: |",
      `| **All** | | | ${setGrandTotal} | ${setGrandWith} | ${setGrandWithout} | ${setGrandPct} |`,
      "",
    );

    perSetCsvLines.push(
      toCsvLine([
        generatedAt,
        "ALL_SETS",
        "",
        "",
        setGrandTotal,
        setGrandWith,
        setGrandWithout,
        setGrandPct,
      ]),
    );

    const setMdPath = path.join(outDir, "tcgdex-id-by-set.md");
    const setCsvPath = path.join(outDir, "tcgdex-id-by-set.csv");
    await writeFile(setMdPath, `${perSetMarkdownLines.join("\n")}\n`, "utf8");
    await writeFile(setCsvPath, `${perSetCsvLines.join("\n")}\n`, "utf8");
    paths.setMarkdown = setMdPath;
    paths.setCsv = setCsvPath;
  }

  return { generatedAt, paths };
}

/**
 * Serialize async work so concurrent set workers do not interleave file writes.
 */
export function createSerializedTaskQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(() => task());
    chain = run.catch(() => {});
    return run as Promise<T>;
  };
}
