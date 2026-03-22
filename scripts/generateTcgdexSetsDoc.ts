/**
 * Fetches all English sets from the TCGdex REST API and writes docs/tcgdex-sets-en.md.
 *
 * Run: npm run docs:tcgdex-sets
 *
 * API: https://api.tcgdex.net/v2/en/sets
 * Docs: https://tcgdex.dev/rest/sets
 */

import fs from "fs/promises";
import path from "path";

const API = "https://api.tcgdex.net/v2/en/sets";

type TcgdexSetListItem = {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  cardCount?: { total?: number; official?: number };
};

const esc = (value: string | undefined | null): string =>
  String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

async function fetchAllSets(): Promise<TcgdexSetListItem[]> {
  const out: TcgdexSetListItem[] = [];
  let page = 1;
  const perPage = 250;

  while (true) {
    const url = `${API}?pagination:page=${page}&pagination:itemsPerPage=${perPage}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`TCGdex sets fetch failed: ${res.status} ${url}`);
    }
    const chunk = (await res.json()) as unknown;
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    out.push(...(chunk as TcgdexSetListItem[]));
    if (chunk.length < perPage) break;
    page += 1;
  }

  return out;
}

async function main() {
  const sets = await fetchAllSets();
  sets.sort((a, b) => a.id.localeCompare(b.id));

  const lines: string[] = [];
  lines.push("# TCGdex API — all sets (English)");
  lines.push("");
  lines.push("Generated from the official TCGdex REST API.");
  lines.push("");
  lines.push("- **Endpoint:** `GET https://api.tcgdex.net/v2/en/sets`");
  lines.push("- **Locale:** `en`");
  lines.push(`- **Set count:** ${sets.length}`);
  lines.push(`- **Generated (UTC):** ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    "Pagination: `pagination:page` + `pagination:itemsPerPage=250` until a page returned fewer than 250 items.",
  );
  lines.push("");
  lines.push(
    "Docs: [TCGdex REST — Searching sets](https://tcgdex.dev/rest/sets) · [Pagination](https://tcgdex.dev/rest/filtering-sorting-pagination)",
  );
  lines.push("");
  lines.push("## Set list");
  lines.push("");
  lines.push("| TCGdex ID | Name | Cards (total) | Cards (official) | Logo | Symbol |");
  lines.push("| --- | --- | ---: | ---: | --- | --- |");

  for (const s of sets) {
    const total = s.cardCount?.total ?? "";
    const official = s.cardCount?.official ?? "";
    const logo = s.logo ? `[logo](${s.logo})` : "—";
    const sym = s.symbol ? `[symbol](${s.symbol})` : "—";
    lines.push(
      `| ${esc(s.id)} | ${esc(s.name)} | ${total} | ${official} | ${logo} | ${sym} |`,
    );
  }

  lines.push("");
  lines.push("## Refresh");
  lines.push("");
  lines.push("Regenerate this file:");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run docs:tcgdex-sets");
  lines.push("```");
  lines.push("");

  const outPath = path.resolve(process.cwd(), "docs/tcgdex-sets-en.md");
  await fs.writeFile(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${outPath} (${sets.length} sets)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
