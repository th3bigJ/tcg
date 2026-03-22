/**
 * Parse MEP Black Star Promos card definitions from local TCGdex-style `.ts` files.
 * Used to build `data/cards/en/mep.json` and to seed Payload when TCGdex is incomplete.
 */

import fs from "fs/promises";
import path from "path";

export type MepJsonCard = {
  id: string;
  name: string;
  supertype: string;
  subtypes: string[];
  hp?: string;
  types?: string[];
  number: string;
  artist?: string;
  rarity?: string;
  nationalPokedexNumbers?: number[];
  images: {
    small: string;
    large: string;
  };
};

const CARD_DIR = path.resolve(
  process.cwd(),
  "data/data/Mega Evolution/MEP Black Star Promos",
);

const stageToSubtype: Record<string, string> = {
  Basic: "Basic",
  Stage1: "Stage 1",
  Stage2: "Stage 2",
};

/** Scrydex asset paths use unpadded numbers: mep-11, mep-9 (see expansion card table). */
export const scrydexMepImageUrls = (printedNumber: number) => {
  const slug = `mep-${printedNumber}`;
  return {
    small: `https://images.scrydex.com/pokemon/${slug}/small`,
    large: `https://images.scrydex.com/pokemon/${slug}/large`,
  };
};

export async function parseAllMepCardsFromDisk(imageSource: "scrydex" | "tcgplayer" = "scrydex"): Promise<MepJsonCard[]> {
  const names = (await fs.readdir(CARD_DIR))
    .filter((f) => /^\d{3}\.ts$/.test(f))
    .sort();

  const cards: MepJsonCard[] = [];

  for (const file of names) {
    const raw = await fs.readFile(path.join(CARD_DIR, file), "utf8");
    const num = file.replace(".ts", "");
    const printed = Number(num);

    const enName = raw.match(/name:\s*\{[\s\S]*?en:\s*"([^"]+)"/)?.[1];
    const cat = raw.match(/category:\s*"([^"]+)"/)?.[1];
    const stageRaw = raw.match(/stage:\s*"([^"]+)"/)?.[1];
    const trainerType = raw.match(/trainerType:\s*"([^"]+)"/)?.[1];
    const hpM = raw.match(/\bhp:\s*(\d+)/);
    const typesM = raw.match(/types:\s*\[([^\]]+)\]/);
    const artist = raw.match(/illustrator:\s*"([^"]+)"/)?.[1];
    const tcgplayer = raw.match(/tcgplayer:\s*(\d+)/)?.[1];
    const rarityRaw = raw.match(/rarity:\s*"([^"]+)"/)?.[1];

    if (!enName) throw new Error(`Missing English name in ${file}`);

    const types = typesM
      ? typesM[1]
          .split(",")
          .map((s) => s.replace(/['"\s]/g, ""))
          .filter(Boolean)
      : [];

    const dexM = raw.match(/dexId:\s*\[([^\]]+)\]/);
    const dexIds = dexM
      ? dexM[1]
          .split(",")
          .map((s) => Number(s.replace(/\D/g, "")))
          .filter((n) => Number.isFinite(n))
      : [];

    const supertype =
      cat === "Pokemon"
        ? "Pokémon"
        : cat === "Trainer"
          ? "Trainer"
          : cat === "Energy"
            ? "Energy"
            : "Pokémon";

    const subtypes: string[] = [];
    if (cat === "Pokemon" && stageRaw) {
      const st = stageToSubtype[stageRaw];
      if (st) subtypes.push(st);
    }
    if (cat === "Trainer" && trainerType) subtypes.push(trainerType);

    let images: { small: string; large: string };
    if (imageSource === "scrydex") {
      images = scrydexMepImageUrls(printed);
    } else {
      if (!tcgplayer) throw new Error(`Missing tcgplayer id in ${file} (required for tcgplayer image source)`);
      images = {
        small: `https://product-images.tcgplayer.com/fit-in/437x437/${tcgplayer}.jpg`,
        large: `https://product-images.tcgplayer.com/fit-in/874x874/${tcgplayer}.jpg`,
      };
    }

    const card: MepJsonCard = {
      id: `mep-${num}`,
      name: enName,
      supertype,
      subtypes,
      number: String(printed),
      images,
    };

    if (artist) card.artist = artist;
    if (rarityRaw && rarityRaw !== "None") card.rarity = rarityRaw;
    if (dexIds.length) card.nationalPokedexNumbers = dexIds;
    if (hpM) card.hp = hpM[1];
    if (types.length) card.types = types;

    cards.push(card);
  }

  return cards;
}
