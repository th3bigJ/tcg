/**
 * Builds `data/cards/en/mep.json` from `data/data/Mega Evolution/MEP Black Star Promos/*.ts`.
 *
 * Default image URLs are from Scrydex (full MEP art). Pass `--images=tcgplayer` to use TCGPlayer CDN instead.
 *
 * Usage:
 *   node --import tsx/esm scripts/buildMepEnCardsJsonFromLocalData.ts
 *   node --import tsx/esm scripts/buildMepEnCardsJsonFromLocalData.ts --images=tcgplayer
 */

import fs from "fs/promises";
import path from "path";

import { parseAllMepCardsFromDisk } from "../lib/mepLocalCardData";

const OUT_FILE = path.resolve(process.cwd(), "data/cards/en/mep.json");

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

async function main(): Promise<void> {
  const images = getArg("images");
  const source = images === "tcgplayer" ? "tcgplayer" : "scrydex";
  const cards = await parseAllMepCardsFromDisk(source);

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${cards.length} cards to ${path.relative(process.cwd(), OUT_FILE)} (images=${source})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
