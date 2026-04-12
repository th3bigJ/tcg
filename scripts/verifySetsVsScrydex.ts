/**
 * Live check: each set in data/pokemon/sets.json resolves to ≥1 Scrydex expansion URL and the page loads.
 *
 *   npx tsx scripts/verifySetsVsScrydex.ts
 */

import fs from "fs";
import path from "path";
import type { SetJsonEntry } from "../lib/staticDataTypes";
import { resolveExpansionConfigsForSet } from "../lib/scrydexExpansionConfigsForSet";
import { isScrydexErrorPage } from "../lib/scrydexCardPageCardText";
import { SCRYDEX_DEFAULT_UA } from "../lib/scrydexExpansionListParsing";

import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const DATA = path.join(pokemonLocalDataRoot, "sets.json");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function verifyExpansionUrl(
  expansionUrl: string,
  listPrefix: string,
): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch(expansionUrl, {
    headers: { "User-Agent": SCRYDEX_DEFAULT_UA, Accept: "text/html" },
    redirect: "follow",
  });
  const html = await res.text();
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
  if (isScrydexErrorPage(html)) return { ok: false, detail: "Scrydex error / maintenance HTML" };
  const p = listPrefix.trim().toLowerCase();
  const needle = `${p}-`;
  if (!html.toLowerCase().includes(needle)) {
    return { ok: false, detail: `HTML missing expected card href pattern (${needle})` };
  }
  return { ok: true, detail: "ok" };
}

async function main(): Promise<void> {
  const sets = JSON.parse(fs.readFileSync(DATA, "utf8")) as SetJsonEntry[];

  const noConfig: string[] = [];
  const badConfig: Array<{ setKey: string; name: string; url: string; prefix: string; detail: string }> = [];
  const ok: string[] = [];

  for (const set of sets) {
    const key = (set.setKey ?? "").trim();
    if (!key) continue;

    const configs = resolveExpansionConfigsForSet(set);
    if (!configs.length) {
      noConfig.push(`${key}\t${set.name}`);
      continue;
    }

    let setOk = true;
    for (const cfg of configs) {
      await sleep(350);
      const r = await verifyExpansionUrl(cfg.expansionUrl, cfg.listPrefix);
      if (!r.ok) {
        setOk = false;
        badConfig.push({
          setKey: key,
          name: set.name,
          url: cfg.expansionUrl,
          prefix: cfg.listPrefix,
          detail: r.detail,
        });
      }
    }
    if (setOk) ok.push(`${key}\t${set.name}\t(${configs.length} expansion(s))`);
  }

  console.log(`=== Sets vs Scrydex (${sets.length} rows) ===\n`);
  console.log(`OK: ${ok.length}`);
  for (const line of ok) console.log(`  ${line}`);

  if (noConfig.length) {
    console.log(`\nNO RESOLVED CONFIG (fix mapping): ${noConfig.length}`);
    for (const line of noConfig) console.log(`  ${line}`);
  }

  if (badConfig.length) {
    console.log(`\nHTTP / HTML FAILURES: ${badConfig.length}`);
    for (const b of badConfig) {
      console.log(`  ${b.setKey}\t${b.name}`);
      console.log(`    ${b.url}`);
      console.log(`    prefix=${b.prefix} → ${b.detail}`);
    }
  }

  const exitBad = noConfig.length + badConfig.length;
  if (exitBad) {
    console.log(`\n→ Exiting 1 (${exitBad} problem(s)).`);
    process.exit(1);
  }
  console.log("\n→ All sets with Scrydex listings verified.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
