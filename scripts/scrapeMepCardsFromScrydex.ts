/**
 * Fetches the [Scrydex MEP expansion](https://scrydex.com/pokemon/expansions/mega-evolution-black-star-promos/mep)
 * listing, downloads each card page, and writes missing `NNN.ts` files under
 * `data/data/Mega Evolution/MEP Black Star Promos/`.
 *
 * Scrydex lists 46 English promos with non-contiguous numbers (e.g. 29–33, 37–45, 64–67).
 * Game text is taken from the public card HTML “Model attributes” panel (English only;
 * other locales are copied from `en` for TCGdex-style shape — refine translations later).
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeMepCardsFromScrydex.ts
 *   node --import tsx/esm scripts/scrapeMepCardsFromScrydex.ts --dry-run
 *   node --import tsx/esm scripts/scrapeMepCardsFromScrydex.ts --min=29
 *   node --import tsx/esm scripts/scrapeMepCardsFromScrydex.ts --overwrite
 */

import fs from "fs/promises";
import path from "path";

import { dexIdForMepName } from "../lib/mepKnownDexIds";
import {
  parseScrydexCardHoverFields,
  parseScrydexSubtypes,
  retreatCountFromRetreatCost,
  splitCsvField,
  stageFromSubtypes,
  zipAbilities,
  zipAttacks,
} from "../lib/scrydexPokemonCardHtml";

const SCRYDEX_UA =
  "Mozilla/5.0 (compatible; TCG-DataScrape/1.0; +https://scrydex.com) AppleWebKit/537.36";

const EXPANSION_URL =
  "https://scrydex.com/pokemon/expansions/mega-evolution-black-star-promos/mep";

const CARD_DIR = path.resolve(
  process.cwd(),
  "data/data/Mega Evolution/MEP Black Star Promos",
);

const HREF_RE = /href="(\/pokemon\/cards\/[^"/]+\/mep-\d+)(?:\?[^"]*)?"/g;

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const getArgNumber = (key: string): number | undefined => {
  const v = getArg(key);
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": SCRYDEX_UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

type CardLink = { slugPath: string; num: number };

function parseExpansionLinks(html: string): CardLink[] {
  const map = new Map<number, string>();
  let m: RegExpExecArray | null;
  while ((m = HREF_RE.exec(html)) !== null) {
    const slugPath = m[1];
    const idM = slugPath.match(/mep-(\d+)$/);
    if (!idM) continue;
    const num = Number(idM[1]);
    if (!Number.isFinite(num)) continue;
    if (!map.has(num)) map.set(num, slugPath);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, slugPath]) => ({ num, slugPath }));
}

/** `keyIndent` = tabs before `en:` / `fr:` keys (e.g. `\t\t` for top-level `name`, `\t\t\t` nested). */
function allLocaleNameObject(en: string, keyIndent: string): string {
  const esc = JSON.stringify(en);
  const closeIndent =
    keyIndent.length >= 1 ? keyIndent.slice(0, Math.max(0, keyIndent.length - 1)) : "";
  return `{
${keyIndent}en: ${esc},
${keyIndent}fr: ${esc},
${keyIndent}de: ${esc},
${keyIndent}it: ${esc},
${keyIndent}es: ${esc},
${keyIndent}pt: ${esc},
${keyIndent}'es-mx': ${esc}
${closeIndent}}`;
}

function tsAttackCost(costRaw: string): string {
  if (!costRaw.trim()) return "[]";
  const parts = splitCsvField(costRaw);
  return `[${parts.map((p) => JSON.stringify(p)).join(", ")}]`;
}

function generatePokemonCardTs(params: {
  displayName: string;
  fields: ReturnType<typeof parseScrydexCardHoverFields>;
}): string {
  const { displayName, fields } = params;
  const subtypes = parseScrydexSubtypes(fields.subtypes?.[0]);
  const stage = stageFromSubtypes(subtypes);
  const supertype = fields.supertype?.[0]?.trim() || "Pokémon";
  if (supertype !== "Pokémon") {
    throw new Error(`Expected Pokémon supertype for ${displayName}, got ${supertype}`);
  }

  const hp = Number(fields.hp?.[0]);
  if (!Number.isFinite(hp)) throw new Error(`Missing hp for ${displayName}`);

  const types = splitCsvField(fields.types?.[0] || "");
  const illustrator = fields.artist?.[0] || "Unknown";

  const suffixLine =
    /\bex\b/i.test(displayName) && displayName.toLowerCase().includes(" ex")
      ? `\tsuffix: "EX",\n`
      : "";

  const stageLine = stage ? `\tstage: "${stage}",\n` : "";

  const dex = dexIdForMepName(displayName);
  const dexLine = dex.length ? `\tdexId: [${dex.join(", ")}],\n` : "";

  const abilities = zipAbilities(fields);
  let abilitiesBlock = "";
  if (abilities.length > 0) {
    const items = abilities
      .filter((a) => a.name || a.text)
      .map((a) => {
        const type = a.type.trim() || "Ability";
        return `\t{\n\t\ttype: ${JSON.stringify(type)},\n\t\tname: ${allLocaleNameObject(a.name || "Ability", "\t\t\t\t")},\n\t\teffect: ${allLocaleNameObject(a.text || "", "\t\t\t\t")}\n\t}`;
      });
    if (items.length > 0) {
      abilitiesBlock = `\n\tabilities: [\n${items.join(",\n")}\n\t],\n`;
    }
  }

  const attacks = zipAttacks(fields);
  const costStrings = fields["attacks.cost"] || [];
  const attackItems = attacks.map((atk, i) => {
    const costRaw = costStrings[i] ?? "";
    const nameBlock = allLocaleNameObject(atk.name || "Attack", "\t\t\t\t");
    const lines: string[] = [];
    lines.push(`\t\t{`);
    lines.push(`\t\t\tcost: ${tsAttackCost(costRaw)},`);
    lines.push(``);
    lines.push(`\t\t\tname: ${nameBlock},`);
    if (atk.text.trim()) {
      lines.push(``);
      lines.push(`\t\t\teffect: ${allLocaleNameObject(atk.text, "\t\t\t\t")},`);
    }
    if (atk.damage.trim()) {
      const d = atk.damage.trim();
      lines.push(``);
      lines.push(
        /^\d+$/.test(d) ? `\t\t\tdamage: ${d},` : `\t\t\tdamage: ${JSON.stringify(d)},`,
      );
    }
    lines.push(`\t\t}`);
    return lines.join("\n");
  });

  if (attackItems.length === 0) {
    throw new Error(`No attacks parsed for ${displayName}`);
  }

  const retreatRaw = fields.retreat_cost?.[0];
  const retreat = retreatCountFromRetreatCost(retreatRaw);
  const retreatLine = retreat != null ? `\tretreat: ${retreat},\n` : "";

	return `import { Card } from "../../../interfaces"
import Set from "../MEP Black Star Promos"

const card: Card = {
	set: Set,

	name: ${allLocaleNameObject(displayName, "\t\t")},
${suffixLine}
	illustrator: ${JSON.stringify(illustrator)},
	rarity: "None",
	category: "Pokemon",
	hp: ${hp},
	types: [${types.map((t) => JSON.stringify(t)).join(", ")}],
${stageLine}${dexLine}${abilitiesBlock}
	attacks: [
${attackItems.join(",\n")}
	],

${retreatLine}
	regulationMark: "I",

	variants: [
		{
			type: "holo"
		}
	]
}

export default card
`;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const overwrite = process.argv.includes("--overwrite");
  const minN = getArgNumber("min");

  console.log(`Fetching expansion: ${EXPANSION_URL}`);
  const expHtml = await fetchText(EXPANSION_URL);
  const links = parseExpansionLinks(expHtml);
  console.log(`Found ${links.length} unique MEP card links.`);

  await fs.mkdir(CARD_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;

  for (const { num, slugPath } of links) {
    if (minN != null && num < minN) continue;

    const padded = String(num).padStart(3, "0");
    const outPath = path.join(CARD_DIR, `${padded}.ts`);

    if (!overwrite) {
      try {
        await fs.access(outPath);
        skipped++;
        continue;
      } catch {
        // write
      }
    }

    const cardUrl = `https://scrydex.com${slugPath}`;
    console.log(`Fetch ${padded}: ${cardUrl}`);
    const html = await fetchText(cardUrl);
    const fields = parseScrydexCardHoverFields(html);
    const displayName = fields.name?.[0];
    if (!displayName) throw new Error(`No name on ${cardUrl}`);

    const supertype = fields.supertype?.[0]?.trim();
    if (supertype !== "Pokémon") {
      console.warn(`Skip ${padded} (${displayName}): supertype=${supertype} — add manually if Trainer/Energy.`);
      skipped++;
      continue;
    }

    const ts = generatePokemonCardTs({
      displayName,
      fields,
    });

    if (dryRun) {
      console.log(`[dry-run] would write ${path.relative(process.cwd(), outPath)}`);
      written++;
      continue;
    }

    await fs.writeFile(outPath, ts, "utf8");
    written++;
  }

  console.log("");
  console.log(dryRun ? `Dry run: ${written} would be written, ${skipped} skipped.` : `Wrote ${written} files, skipped ${skipped}.`);
  console.log("Ensure `MEP Black Star Promos.ts` has `cardCount.official: 46`, then:");
  console.log("  npm run build:cards-json:mep");
  console.log("  npm run seed:set:mep:scrydex -- --replace-images");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
