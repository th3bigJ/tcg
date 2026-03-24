import nextEnvImport from "@next/env";
import { writeFile } from "node:fs/promises";
import path from "node:path";

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

type SetRow = {
  id: string;
  name: string;
  tcgdexId: string;
  seriesName: string;
};

type SetCoverage = {
  total: number;
  noPricing: number;
};

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
    const seriesNameById = new Map(
      seriesResult.docs.map((row) => [String(row.id), String(row.name ?? "")]),
    );

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
        seriesName: seriesNameById.get(seriesId) ?? "Unassigned",
      };
    });

    const setCoverage = new Map<string, SetCoverage>();
    const pageSize = 500;
    let page = 1;
    while (true) {
      const cardsResult = await payload.find({
        collection: "master-card-list",
        limit: pageSize,
        page,
        depth: 0,
        overrideAccess: true,
        select: { set: true, no_pricing: true },
      });

      for (const card of cardsResult.docs) {
        const setId =
          typeof card.set === "object" && card.set && "id" in card.set
            ? String(card.set.id)
            : card.set != null
              ? String(card.set)
              : "";
        if (!setId) continue;
        const current = setCoverage.get(setId) ?? { total: 0, noPricing: 0 };
        current.total += 1;
        if (card.no_pricing === true) {
          current.noPricing += 1;
        }
        setCoverage.set(setId, current);
      }

      if (cardsResult.docs.length < pageSize) break;
      page += 1;
    }

    const generatedAt = new Date().toISOString();
    const sortedSets = [...setRows].sort((a, b) => {
      const bySeries = a.seriesName.localeCompare(b.seriesName);
      if (bySeries !== 0) return bySeries;
      return a.name.localeCompare(b.name);
    });

    const mdLines: string[] = [
      "# no_pricing cards by set (>0%)",
      "",
      `Generated at (UTC): **${generatedAt}**`,
      "",
      "Only sets where `% no_pricing` is greater than 0 are listed below.",
      "",
      "| Series | Set name | set_tcgdex_id | Cards total | no_pricing true | % no_pricing |",
      "| --- | --- | --- | ---: | ---: | ---: |",
    ];
    const csvLines: string[] = [
      toCsvLine([
        "generated_at_utc",
        "series_name",
        "set_name",
        "set_tcgdex_id",
        "cards_total",
        "cards_no_pricing_true",
        "percent_no_pricing",
      ]),
    ];

    let grandTotal = 0;
    let grandNoPricing = 0;
    for (const set of sortedSets) {
      const cov = setCoverage.get(set.id) ?? { total: 0, noPricing: 0 };
      const pct = cov.total > 0 ? Math.round((cov.noPricing / cov.total) * 1000) / 10 : 0;
      if (pct <= 0) {
        continue;
      }
      grandTotal += cov.total;
      grandNoPricing += cov.noPricing;
      const esc = (s: string) => s.replaceAll("|", "\\|");
      mdLines.push(
        `| ${esc(set.seriesName)} | ${esc(set.name)} | ${esc(set.tcgdexId || "\u2014")} | ${cov.total} | ${cov.noPricing} | ${pct} |`,
      );
      csvLines.push(
        toCsvLine([generatedAt, set.seriesName, set.name, set.tcgdexId, cov.total, cov.noPricing, pct]),
      );
    }

    const grandPct = grandTotal > 0 ? Math.round((grandNoPricing / grandTotal) * 1000) / 10 : 0;
    mdLines.push(
      "",
      "## Total (listed sets only)",
      "",
      "| | | | Cards total | no_pricing true | % no_pricing |",
      "| --- | --- | --- | ---: | ---: | ---: |",
      `| **All** | | | ${grandTotal} | ${grandNoPricing} | ${grandPct} |`,
      "",
    );
    csvLines.push(toCsvLine([generatedAt, "ALL_SETS", "", "", grandTotal, grandNoPricing, grandPct]));

    const outDir = path.join(process.cwd(), "docs");
    const mdPath = path.join(outDir, "tcgdex-no-pricing-by-set.md");
    const csvPath = path.join(outDir, "tcgdex-no-pricing-by-set.csv");
    await writeFile(mdPath, `${mdLines.join("\n")}\n`, "utf8");
    await writeFile(csvPath, `${csvLines.join("\n")}\n`, "utf8");

    console.log(
      JSON.stringify(
        {
          ok: true,
          generatedAt,
          files: {
            markdown: mdPath,
            csv: csvPath,
          },
          totals: {
            cards: grandTotal,
            noPricingTrue: grandNoPricing,
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

