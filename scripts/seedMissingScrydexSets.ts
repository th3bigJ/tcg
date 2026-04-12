import fs from "fs";
import path from "path";
import { fetchScrydexExpansionMultiPageHtml } from "../lib/scrydexExpansionListParsing";
import type { CardJsonEntry, SetJsonEntry } from "../lib/staticDataTypes";

import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const DATA_DIR = pokemonLocalDataRoot;
const CARDS_DIR = path.join(DATA_DIR, "cards");
const SETS_FILE = path.join(DATA_DIR, "sets.json");

type SeedTarget = {
  setId: string;
  expansionUrl: string;
  listPrefix: string;
  seriesName: string;
  source: "tcgdex+scrydex" | "scrydex";
};

const TARGETS: readonly SeedTarget[] = [
  {
    setId: "2022swsh",
    expansionUrl: "https://scrydex.com/pokemon/expansions/mcdonalds-collection-2022/mcd22",
    listPrefix: "mcd22",
    seriesName: "McDonald's Collection",
    source: "tcgdex+scrydex",
  },
  {
    setId: "2023sv",
    expansionUrl: "https://scrydex.com/pokemon/expansions/mcdonalds-collection-2023/mcd23",
    listPrefix: "mcd23",
    seriesName: "McDonald's Collection",
    source: "tcgdex+scrydex",
  },
  {
    setId: "2024sv",
    expansionUrl: "https://scrydex.com/pokemon/expansions/mcdonalds-collection-2024/mcd24",
    listPrefix: "mcd24",
    seriesName: "McDonald's Collection",
    source: "tcgdex+scrydex",
  },
  {
    setId: "ex5.5",
    expansionUrl: "https://scrydex.com/pokemon/expansions/pok-card-creator-pack/wb1",
    listPrefix: "wb1",
    seriesName: "EX",
    source: "tcgdex+scrydex",
  },
  {
    setId: "cel25c",
    expansionUrl: "https://scrydex.com/pokemon/expansions/celebrations-classic-collection/cel25c",
    listPrefix: "cel25c",
    seriesName: "Sword & Shield",
    source: "scrydex",
  },
  {
    setId: "clv",
    expansionUrl: "https://scrydex.com/pokemon/expansions/pokmon-tcg-classic-venusaur/clv",
    listPrefix: "clv",
    seriesName: "Miscellaneous",
    source: "scrydex",
  },
  {
    setId: "clc",
    expansionUrl: "https://scrydex.com/pokemon/expansions/pokmon-tcg-classic-charizard/clc",
    listPrefix: "clc",
    seriesName: "Miscellaneous",
    source: "scrydex",
  },
  {
    setId: "clb",
    expansionUrl: "https://scrydex.com/pokemon/expansions/pokmon-tcg-classic-blastoise/clb",
    listPrefix: "clb",
    seriesName: "Miscellaneous",
    source: "scrydex",
  },
] as const;

type TcgdexSet = {
  id: string;
  name: string;
  releaseDate?: string;
  cardCount?: { official?: number; total?: number };
  cards?: Array<{ id: string; localId: string; name: string }>;
};

type TcgdexCard = {
  id: string;
  localId?: string;
  name: string;
  rarity?: string | null;
  category?: string;
  stage?: string | null;
  hp?: number | null;
  types?: string[];
  dexId?: number[];
  illustrator?: string | null;
};

type ScrydexListingCard = {
  externalId: string;
  localId: string;
  cardName: string;
  path: string;
  imageUrl: string;
  variant: string;
};

type ScrydexCardMeta = {
  name: string;
  localId: string;
  rarity: string | null;
  category: string | null;
  stage: string | null;
  trainerType: string | null;
  energyType: string | null;
  hp: number | null;
  elementTypes: string[] | null;
  dexIds: number[] | null;
  artist: string | null;
  imageUrl: string;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function padLocalId(localId: string | undefined): string {
  const value = (localId ?? "").trim();
  if (!value) return "";
  return /^\d+$/u.test(value) ? value.padStart(3, "0") : value;
}

function normalizeCategory(category: string | undefined): string | null {
  if (!category) return null;
  if (category === "Pokemon") return "Pokémon";
  return category;
}

function normalizeStage(stage: string | undefined | null): string | null {
  const value = (stage ?? "").trim();
  if (!value) return null;
  const compact = value.replace(/\s+/g, "").toLowerCase();
  if (compact === "stage1") return "Stage 1";
  if (compact === "stage2") return "Stage 2";
  if (compact === "basic") return "Basic";
  return value;
}

function normalizeTypes(types: string[] | null | undefined): string[] | null {
  if (!types?.length) return null;
  return types.map((type) => type.trim()).filter(Boolean);
}

function buildFullDisplayName(name: string, cardNumber: string, setName: string): string {
  return `${name} ${cardNumber} ${setName}`.trim();
}

function parseScrydexHeader(html: string): {
  name: string;
  code: string;
  series: string;
  cardCount: number;
  releaseDate: string;
  logoUrl: string;
  symbolUrl: string | null;
} {
  const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const metaMatch = html.match(
    /<span class="text-body-14 bg-mono-2[^"]*">([^<]+)<\/span><span class="text-mono-2">•<\/span><span class="text-heading-16">([^<]+)<\/span><span class="text-mono-2">•<\/span><span class="text-heading-16">(\d+) cards<\/span><span class="text-mono-2">•<\/span><span class="text-heading-16">Released (\d{4}\/\d{2}\/\d{2})<\/span>/i,
  );
  const logoMatch = html.match(/https:\/\/images\.scrydex\.com\/pokemon\/([a-z0-9.]+)-logo\/logo/iu);
  const symbolMatch = html.match(/https:\/\/images\.scrydex\.com\/pokemon\/([a-z0-9.]+)-symbol\/symbol/iu);
  if (!nameMatch || !metaMatch || !logoMatch) {
    throw new Error("Failed to parse Scrydex expansion header");
  }
  return {
    name: stripTags(nameMatch[1]),
    code: stripTags(metaMatch[1]),
    series: stripTags(metaMatch[2]),
    cardCount: Number.parseInt(metaMatch[3], 10),
    releaseDate: metaMatch[4],
    logoUrl: `https://images.scrydex.com/pokemon/${logoMatch[1]}-logo/logo`,
    symbolUrl: symbolMatch ? `https://images.scrydex.com/pokemon/${symbolMatch[1]}-symbol/symbol` : null,
  };
}

function parseScrydexListingCards(html: string): ScrydexListingCard[] {
  const re =
    /<a[^>]+href="([^"]*\/pokemon\/cards\/[^"]+\/([^"?]+))(?:\?variant=([^"]+))?"[^>]*>[\s\S]*?<img[^>]+src="(https:\/\/images\.scrydex\.com\/pokemon\/[^"]+)"[\s\S]*?<span class="text-body-12 text-white text-center">([^<]+?)\s+#([^<]+)<\/span>/giu;
  return [...html.matchAll(re)]
    .map((match) => ({
      path: match[1],
      externalId: match[2],
      variant: (match[3] ?? "default").trim().toLowerCase(),
      imageUrl: match[4].trim(),
      cardName: stripTags(match[5]),
      localId: padLocalId(stripTags(match[6])),
    }))
    .sort((a, b) => a.externalId.localeCompare(b.externalId, undefined, { numeric: true }));
}

function scoreScrydexListing(entry: ScrydexListingCard): number {
  if (entry.variant === "holofoil") return 3;
  if (entry.variant === "default") return 2;
  return 1;
}

function bestListingByLocalId(listingCards: ScrydexListingCard[]): Map<string, ScrydexListingCard> {
  const out = new Map<string, ScrydexListingCard>();
  for (const current of listingCards) {
    const prev = out.get(current.localId);
    if (!prev || scoreScrydexListing(current) > scoreScrydexListing(prev)) {
      out.set(current.localId, current);
    }
  }
  return out;
}

function dedupeListingsByExternalId(listingCards: ScrydexListingCard[]): ScrydexListingCard[] {
  const out = new Map<string, ScrydexListingCard>();
  for (const current of listingCards) {
    const prev = out.get(current.externalId);
    if (!prev || scoreScrydexListing(current) > scoreScrydexListing(prev)) {
      out.set(current.externalId, current);
    }
  }
  return [...out.values()];
}

function uniquifyDuplicateLocalIds(cards: CardJsonEntry[]): void {
  const grouped = new Map<string, CardJsonEntry[]>();
  for (const card of cards) {
    const key = card.localId ?? "";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(card);
  }
  for (const [localId, group] of grouped) {
    if (!localId || group.length <= 1) continue;
    const suffixes = "abcdefghijklmnopqrstuvwxyz";
    group
      .sort((a, b) => a.cardName.localeCompare(b.cardName))
      .forEach((card, index) => {
        const suffix = suffixes[index] ?? String(index + 1);
        card.localId = `${localId}${suffix}`;
      });
  }
}

function parseVisibleTags(html: string): string[] {
  const start = html.indexOf('<div class="mt-2"><div class="sr-only">Subtypes</div>');
  if (start < 0) return [];
  const end = html.indexOf('<div class="w-full" data-controller="prices">', start);
  const segment = html.slice(start, end > start ? end : start + 2500);
  return [...segment.matchAll(/<div>([^<]+)<\/div>/g)]
    .map((match) => stripTags(match[1]))
    .filter(Boolean)
    .filter((value) => !["Subtypes", "Prices"].includes(value));
}

function parseScrydexTypeNames(html: string): string[] {
  const out = [...html.matchAll(/\/assets\/([a-z]+)-[a-f0-9]+\.(?:png|svg)/g)]
    .map((match) => match[1])
    .filter((name) =>
      ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "colorless", "fairy"].includes(name),
    )
    .map((name) => name[0].toUpperCase() + name.slice(1));
  return [...new Set(out)];
}

function parseScrydexCardMeta(html: string): ScrydexCardMeta {
  const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+?)\s+#([^"]+)\s+-/i);
  const titleMatch = html.match(/<title>([^#<]+?)\s+#([^<]+)\s+-/i);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
  const hpMatch = html.match(/<span class="text-white">HP\s+(\d+)<\/span>/i);
  const artistMatch = html.match(/<div class="mb-2 text-sm text-white">Artist<\/div>[\s\S]*?<div class="text-body-16 text-mono-4">([^<]+)<\/div>/i);
  const rarityMatch = html.match(/<div class="mb-2 text-sm text-white">Rarity<\/div>[\s\S]*?<div class="text-body-16 text-mono-4">([^<]+)<\/div>/i);
  const titleSource = ogTitleMatch ?? titleMatch;
  if (!titleSource || !imageMatch) {
    throw new Error("Failed to parse Scrydex card meta");
  }

  const name = stripTags(titleSource[1]);
  const localId = padLocalId(stripTags(titleSource[2]));
  const visibleTags = parseVisibleTags(html);
  const category = visibleTags.find((value) => ["Pokémon", "Trainer", "Energy"].includes(value)) ?? null;
  const subtypes = visibleTags.filter((value) => value !== category);
  const stage = normalizeStage(subtypes.find((value) => /^(Basic|Stage ?1|Stage ?2)$/i.test(value)) ?? null);
  const trainerType = category === "Trainer" ? (subtypes[0] ?? null) : null;
  const energyType = category === "Energy" ? (subtypes[0] ?? null) : null;
  const elementTypes = category === "Pokémon" ? normalizeTypes(parseScrydexTypeNames(html).slice(0, 2)) : null;

  return {
    name,
    localId,
    rarity: rarityMatch ? stripTags(rarityMatch[1]) : null,
    category,
    stage,
    trainerType,
    energyType,
    hp: hpMatch ? Number.parseInt(hpMatch[1], 10) : null,
    elementTypes,
    dexIds: null,
    artist: artistMatch ? stripTags(artistMatch[1]) : null,
    imageUrl: imageMatch[1].trim(),
  };
}

function buildCardFromTcgdex(
  detail: TcgdexCard,
  setId: string,
  setName: string,
  officialCount: number,
  masterCardId: number,
  imageUrl: string,
  externalId: string | null,
): CardJsonEntry {
  const localId = padLocalId(detail.localId);
  const cardNumber = `${localId}/${String(officialCount)}`;
  const category = normalizeCategory(detail.category);
  const stage = normalizeStage(detail.stage);

  return {
    masterCardId: String(masterCardId),
    externalId,
    localId,
    setCode: setId,
    cardNumber,
    cardName: detail.name,
    fullDisplayName: buildFullDisplayName(detail.name, cardNumber, setName),
    rarity: detail.rarity ?? null,
    category,
    hp: typeof detail.hp === "number" ? detail.hp : null,
    elementTypes: normalizeTypes(detail.types) ?? [],
    dexIds: detail.dexId ?? null,
    trainerType: null,
    energyType: null,
    regulationMark: null,
    artist: detail.illustrator ?? null,
    imageLowSrc: imageUrl,
    imageHighSrc: imageUrl,
  };
}

function buildCardFromScrydex(
  meta: ScrydexCardMeta,
  setId: string,
  setName: string,
  officialCount: number,
  masterCardId: number,
  externalId: string,
): CardJsonEntry {
  const cardNumber = `${meta.localId}/${String(officialCount)}`;
  return {
    masterCardId: String(masterCardId),
    externalId,
    localId: meta.localId,
    setCode: setId,
    cardNumber,
    cardName: meta.name,
    fullDisplayName: buildFullDisplayName(meta.name, cardNumber, setName),
    rarity: meta.rarity,
    category: meta.category,
    hp: meta.hp,
    elementTypes: meta.elementTypes ?? [],
    dexIds: meta.dexIds,
    trainerType: meta.trainerType,
    energyType: meta.energyType,
    regulationMark: null,
    artist: meta.artist,
    imageLowSrc: meta.imageUrl,
    imageHighSrc: meta.imageUrl,
  };
}

function getNextSetNumericId(sets: SetJsonEntry[]): number {
  return (
    Math.max(
      0,
      ...sets.map((set) => Number.parseInt(set.id, 10)).filter((value) => Number.isFinite(value)),
    ) + 1
  );
}

function getNextMasterCardId(): number {
  const existingFiles = fs.readdirSync(CARDS_DIR).filter((name) => name.endsWith(".json"));
  return (
    Math.max(
      0,
      ...existingFiles.flatMap((file) => {
        const cards = readJson<CardJsonEntry[]>(path.join(CARDS_DIR, file));
        return cards.map((card) => Number.parseInt(card.masterCardId, 10)).filter(Number.isFinite);
      }),
    ) + 1
  );
}

function upsertSet(sets: SetJsonEntry[], nextSetIdRef: { current: number }, nextSet: SetJsonEntry): void {
  const idx = sets.findIndex((set) => set.setKey === nextSet.setKey);
  if (idx >= 0) {
    sets[idx] = { ...sets[idx], ...nextSet, id: sets[idx].id };
    return;
  }
  sets.push({ ...nextSet, id: String(nextSetIdRef.current++) });
}

async function seedTarget(
  target: SeedTarget,
  sets: SetJsonEntry[],
  nextSetIdRef: { current: number },
  nextMasterCardIdRef: { current: number },
): Promise<void> {
  const expansionHtml = await fetchScrydexExpansionMultiPageHtml(target.expansionUrl);
  const header = parseScrydexHeader(expansionHtml);
  const listingCards = parseScrydexListingCards(expansionHtml);
  const listingByLocalId = bestListingByLocalId(listingCards);

  let setName = header.name;
  let releaseDate = `${header.releaseDate}T00:00:00.000Z`;
  let cardCountOfficial = header.cardCount;
  let cardCountTotal = header.cardCount;

  const cards: CardJsonEntry[] = [];

  if (target.source === "tcgdex+scrydex") {
    const setSummary = await fetchJson<TcgdexSet>(`https://api.tcgdex.net/v2/en/sets/${target.setId}`);
    setName = setSummary.name;
    releaseDate = setSummary.releaseDate ? `${setSummary.releaseDate}T00:00:00.000Z` : releaseDate;
    cardCountOfficial = setSummary.cardCount?.official ?? cardCountOfficial;
    cardCountTotal = setSummary.cardCount?.total ?? cardCountTotal;

    for (const summaryCard of setSummary.cards ?? []) {
      const detail = await fetchJson<TcgdexCard>(`https://api.tcgdex.net/v2/en/cards/${summaryCard.id}`);
      const localId = padLocalId(detail.localId ?? summaryCard.localId);
      const listing = listingByLocalId.get(localId);
      if (!listing) {
        throw new Error(`Missing Scrydex listing image for ${target.setId} ${localId}`);
      }
      cards.push(
        buildCardFromTcgdex(
          detail,
          target.setId,
          setName,
          cardCountOfficial,
          nextMasterCardIdRef.current++,
          listing.imageUrl,
          listing.externalId,
        ),
      );
    }
  } else {
    for (const listing of dedupeListingsByExternalId(listingCards)) {
      const cardHtml = await fetch(`https://scrydex.com${listing.path}?variant=${listing.variant}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      }).then((res) => {
        if (!res.ok) throw new Error(`Scrydex card ${listing.path}: HTTP ${res.status}`);
        return res.text();
      });
      let meta: ScrydexCardMeta;
      try {
        meta = parseScrydexCardMeta(cardHtml);
      } catch (error) {
        throw new Error(
          `Failed to parse Scrydex card meta for ${target.setId} ${listing.externalId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      cards.push(
        buildCardFromScrydex(
          meta,
          target.setId,
          setName,
          cardCountOfficial,
          nextMasterCardIdRef.current++,
          listing.externalId,
        ),
      );
    }
    uniquifyDuplicateLocalIds(cards);
  }

  cards.sort((a, b) => b.localId.localeCompare(a.localId, undefined, { numeric: true }));
  writeJson(path.join(CARDS_DIR, `${target.setId}.json`), cards);

  upsertSet(sets, nextSetIdRef, {
    id: String(nextSetIdRef.current),
    name: setName,
    setKey: target.setId,
    releaseDate,
    cardCountTotal,
    cardCountOfficial,
    seriesName: target.seriesName,
    logoSrc: header.logoUrl,
    symbolSrc: header.symbolUrl,
  });

  console.log(`${target.setId}\t${cards.length}\t${setName}`);
}

async function main(): Promise<void> {
  const sets = readJson<SetJsonEntry[]>(SETS_FILE);
  const nextSetIdRef = { current: getNextSetNumericId(sets) };
  const nextMasterCardIdRef = { current: getNextMasterCardId() };

  for (const target of TARGETS) {
    await seedTarget(target, sets, nextSetIdRef, nextMasterCardIdRef);
  }

  sets.sort((a, b) => {
    const ad = a.releaseDate ? Date.parse(a.releaseDate) : 0;
    const bd = b.releaseDate ? Date.parse(b.releaseDate) : 0;
    if (bd !== ad) return bd - ad;
    return Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10);
  });

  writeJson(SETS_FILE, sets);
}

await main();
