/**
 * Scrydex expansion URLs keyed by TCGdex-style set id (English sets on https://scrydex.com/pokemon/expansions ).
 * Mega Evolution + Scarlet & Violet promos / special ids live in `scrydexMegaEvolutionUrls` and `scrydexScarletVioletUrls`.
 */

import type { ScrydexExpansionListConfig } from "@/lib/scrydexMegaEvolutionUrls";

const BASE = "https://scrydex.com/pokemon/expansions";

/** [tcgdex set id, scrydex URL slug, listPrefix in card hrefs] */
const BULK_ROWS: readonly [string, string, string][] = [
  // --- Other (McDonald's, misc) ---
  ["mcd24", "mcdonalds-collection-2024", "mcd24"],
  ["mcd23", "mcdonalds-collection-2023", "mcd23"],
  ["mcd22", "mcdonalds-collection-2022", "mcd22"],
  ["mcd21", "mcdonalds-collection-2021", "mcd21"],
  ["fut20", "pokmon-futsal-collection", "fut20"],
  ["mcd19", "mcdonalds-collection-2019", "mcd19"],
  ["mcd18", "mcdonalds-collection-2018", "mcd18"],
  ["mcd17", "mcdonalds-collection-2017", "mcd17"],
  ["mcd16", "mcdonalds-collection-2016", "mcd16"],
  ["mcd15", "mcdonalds-collection-2015", "mcd15"],
  ["mcd14", "mcdonalds-collection-2014", "mcd14"],
  ["mcd12", "mcdonalds-collection-2012", "mcd12"],
  ["mcd11", "mcdonalds-collection-2011", "mcd11"],
  ["clv", "pokmon-tcg-classic-venusaur", "clv"],
  ["clc", "pokmon-tcg-classic-charizard", "clc"],
  ["clb", "pokmon-tcg-classic-blastoise", "clb"],
  ["ru1", "pokmon-rumble", "ru1"],
  ["wb1", "pok-card-creator-pack", "wb1"],
  ["bp", "best-of-game", "bp"],
  ["base6", "legendary-collection", "base6"],
  ["si1", "southern-islands", "si1"],
  // --- Sword & Shield ---
  ["swsh12pt5gg", "crown-zenith-galarian-gallery", "swsh12pt5gg"],
  ["swsh12pt5", "crown-zenith", "swsh12pt5"],
  ["swsh12tg", "silver-tempest-trainer-gallery", "swsh12tg"],
  ["swsh12", "silver-tempest", "swsh12"],
  ["swsh11tg", "lost-origin-trainer-gallery", "swsh11tg"],
  ["swsh11", "lost-origin", "swsh11"],
  ["pgo", "pokmon-go", "pgo"],
  ["swsh10tg", "astral-radiance-trainer-gallery", "swsh10tg"],
  ["swsh10", "astral-radiance", "swsh10"],
  ["swsh9tg", "brilliant-stars-trainer-gallery", "swsh9tg"],
  ["swsh9", "brilliant-stars", "swsh9"],
  ["swsh8", "fusion-strike", "swsh8"],
  ["cel25c", "celebrations-classic-collection", "cel25c"],
  ["cel25", "celebrations", "cel25"],
  ["swsh7", "evolving-skies", "swsh7"],
  ["swsh6", "chilling-reign", "swsh6"],
  ["swsh5", "battle-styles", "swsh5"],
  ["swsh45sv", "shining-fates-shiny-vault", "swsh45sv"],
  ["swsh45", "shining-fates", "swsh45"],
  ["swsh4", "vivid-voltage", "swsh4"],
  ["swsh35", "champions-path", "swsh35"],
  ["swsh3", "darkness-ablaze", "swsh3"],
  ["swsh2", "rebel-clash", "swsh2"],
  ["swsh1", "sword-shield", "swsh1"],
  ["swshp", "swsh-black-star-promos", "swshp"],
  // --- Sun & Moon ---
  ["sm12", "cosmic-eclipse", "sm12"],
  ["sma", "hidden-fates-shiny-vault", "sma"],
  ["sm115", "hidden-fates", "sm115"],
  ["sm11", "unified-minds", "sm11"],
  ["sm10", "unbroken-bonds", "sm10"],
  ["det1", "detective-pikachu", "det1"],
  ["sm9", "team-up", "sm9"],
  ["sm8", "lost-thunder", "sm8"],
  ["sm75", "dragon-majesty", "sm75"],
  ["sm7", "celestial-storm", "sm7"],
  ["sm6", "forbidden-light", "sm6"],
  ["sm5", "ultra-prism", "sm5"],
  ["sm4", "crimson-invasion", "sm4"],
  ["sm35", "shining-legends", "sm35"],
  ["sm3", "burning-shadows", "sm3"],
  ["sm2", "guardians-rising", "sm2"],
  ["smp", "sm-black-star-promos", "smp"],
  ["sm1", "sun-moon", "sm1"],
  // --- XY ---
  ["xy12", "evolutions", "xy12"],
  ["xy11", "steam-siege", "xy11"],
  ["xy10", "fates-collide", "xy10"],
  ["g1", "generations", "g1"],
  ["xy9", "breakpoint", "xy9"],
  ["xy8", "breakthrough", "xy8"],
  ["xy7", "ancient-origins", "xy7"],
  ["xy6", "roaring-skies", "xy6"],
  ["dc1", "double-crisis", "dc1"],
  ["xy5", "primal-clash", "xy5"],
  ["xy4", "phantom-forces", "xy4"],
  ["xy3", "furious-fists", "xy3"],
  ["xy2", "flashfire", "xy2"],
  ["xy1", "xy", "xy1"],
  ["xy0", "kalos-starter-set", "xy0"],
  ["xyp", "xy-black-star-promos", "xyp"],
  // --- Black & White ---
  ["bw11", "legendary-treasures", "bw11"],
  ["bw10", "plasma-blast", "bw10"],
  ["bw9", "plasma-freeze", "bw9"],
  ["bw8", "plasma-storm", "bw8"],
  ["bw7", "boundaries-crossed", "bw7"],
  ["dv1", "dragon-vault", "dv1"],
  ["bw6", "dragons-exalted", "bw6"],
  ["bw5", "dark-explorers", "bw5"],
  ["bw4", "next-destinies", "bw4"],
  ["bw3", "noble-victories", "bw3"],
  ["bw2", "emerging-powers", "bw2"],
  ["bw1", "black-white", "bw1"],
  ["bwp", "bw-black-star-promos", "bwp"],
  // --- HeartGold & SoulSilver ---
  ["col1", "call-of-legends", "col1"],
  ["hgss4", "hstriumphant", "hgss4"],
  ["hgss3", "hsundaunted", "hgss3"],
  ["hgss2", "hsunleashed", "hgss2"],
  ["hsp", "hgss-black-star-promos", "hsp"],
  ["hgss1", "heartgold-soulsilver", "hgss1"],
  // --- Platinum ---
  ["pl4", "arceus", "pl4"],
  ["pl3", "supreme-victors", "pl3"],
  ["pl2", "rising-rivals", "pl2"],
  ["pl1", "platinum", "pl1"],
  // --- Diamond & Pearl ---
  ["dp7", "stormfront", "dp7"],
  ["dp6", "legends-awakened", "dp6"],
  ["dp5", "majestic-dawn", "dp5"],
  ["dp4", "great-encounters", "dp4"],
  ["dp3", "secret-wonders", "dp3"],
  ["dp2", "mysterious-treasures", "dp2"],
  ["dpp", "dp-black-star-promos", "dpp"],
  ["dp1", "diamond-pearl", "dp1"],
  // --- EX ---
  ["ex16", "power-keepers", "ex16"],
  ["ex15", "dragon-frontiers", "ex15"],
  ["ex14", "crystal-guardians", "ex14"],
  ["ex13", "holon-phantoms", "ex13"],
  ["tk2b", "ex-trainer-kit-2-minun", "tk2b"],
  ["tk2a", "ex-trainer-kit-2-plusle", "tk2a"],
  ["ex12", "legend-maker", "ex12"],
  ["ex11", "delta-species", "ex11"],
  ["ex10", "unseen-forces", "ex10"],
  ["ex9", "emerald", "ex9"],
  ["ex8", "deoxys", "ex8"],
  ["ex7", "team-rocket-returns", "ex7"],
  ["ex6", "firered-leafgreen", "ex6"],
  ["ex5", "hidden-legends", "ex5"],
  ["tk1b", "ex-trainer-kit-latios", "tk1b"],
  ["tk1a", "ex-trainer-kit-latias", "tk1a"],
  ["ex4", "team-magma-vs-team-aqua", "ex4"],
  ["ex3", "dragon", "ex3"],
  ["ex2", "sandstorm", "ex2"],
  ["ex1", "ruby-sapphire", "ex1"],
  // --- NP (Nintendo promos) ---
  ["np", "nintendo-black-star-promos", "np"],
  // --- POP ---
  ["pop9", "pop-series-9", "pop9"],
  ["pop8", "pop-series-8", "pop8"],
  ["pop7", "pop-series-7", "pop7"],
  ["pop6", "pop-series-6", "pop6"],
  ["pop5", "pop-series-5", "pop5"],
  ["pop4", "pop-series-4", "pop4"],
  ["pop3", "pop-series-3", "pop3"],
  ["pop2", "pop-series-2", "pop2"],
  ["pop1", "pop-series-1", "pop1"],
  // --- E-Card ---
  ["ecard3", "skyridge", "ecard3"],
  ["ecard2", "aquapolis", "ecard2"],
  ["ecard1", "expedition-base-set", "ecard1"],
  // --- Neo ---
  ["neo4", "neo-destiny", "neo4"],
  ["neo3", "neo-revelation", "neo3"],
  ["neo2", "neo-discovery", "neo2"],
  ["neo1", "neo-genesis", "neo1"],
  // --- Gym ---
  ["gym2", "gym-challenge", "gym2"],
  ["gym1", "gym-heroes", "gym1"],
  // --- Base ---
  ["base5", "team-rocket", "base5"],
  ["base4", "base-set-2", "base4"],
  ["base3", "fossil", "base3"],
  ["basep", "wizards-black-star-promos", "basep"],
  ["base2", "jungle", "base2"],
  ["base1", "base", "base1"],
];

const BULK_BY_CODE: Record<string, ScrydexExpansionListConfig> = (() => {
  const out: Record<string, ScrydexExpansionListConfig> = {};
  for (const [code, slug, prefix] of BULK_ROWS) {
    out[code.toLowerCase()] = {
      expansionUrl: `${BASE}/${slug}/${prefix}`,
      listPrefix: prefix,
    };
  }
  return out;
})();

const BULK_ALIASES: Record<string, string> = {
  swsh01: "swsh1",
  swsh02: "swsh2",
  swsh03: "swsh3",
  swsh04: "swsh4",
  swsh05: "swsh5",
  swsh06: "swsh6",
  swsh07: "swsh7",
  swsh08: "swsh8",
  swsh09: "swsh9",
  sm01: "sm1",
  sm02: "sm2",
  sm03: "sm3",
  sm04: "sm4",
  sm05: "sm5",
  sm06: "sm6",
  sm07: "sm7",
  sm08: "sm8",
  sm09: "sm9",
  xy01: "xy1",
  xy02: "xy2",
  bw01: "bw1",
  dp01: "dp1",
  ex01: "ex1",
  ex02: "ex2",
  ex03: "ex3",
  ex04: "ex4",
  ex05: "ex5",
  ex06: "ex6",
  ex07: "ex7",
  ex08: "ex8",
  ex09: "ex9",
  neo01: "neo1",
  neo02: "neo2",
  neo03: "neo3",
  neo04: "neo4",
  gym01: "gym1",
  gym02: "gym2",
  pop01: "pop1",
  pop02: "pop2",
  pop03: "pop3",
  pop04: "pop4",
  pop05: "pop5",
  pop06: "pop6",
  pop07: "pop7",
  pop08: "pop8",
  pop09: "pop9",
  lc: "base6",
  legendarycollection: "base6",
};

export function lookupScrydexBulkExpansionConfig(
  canonicalSetCode: string,
  legacyCode: string | undefined,
  setTcgdexId: string | undefined,
): ScrydexExpansionListConfig | null {
  const candidates = [canonicalSetCode, legacyCode, setTcgdexId].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  for (const c of candidates) {
    const k = c.trim().toLowerCase().replace(/\s+/g, "");
    const direct = BULK_BY_CODE[k];
    if (direct) return direct;
    const aliased = BULK_ALIASES[k];
    if (aliased && BULK_BY_CODE[aliased]) return BULK_BY_CODE[aliased];
  }
  return null;
}
