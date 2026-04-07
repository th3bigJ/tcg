import fs from "fs";
import path from "path";
import type { CardJsonEntry, SetJsonEntry } from "../lib/staticDataTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");
const SETS_FILE = path.join(DATA_DIR, "sets.json");

type Target = {
  code: string;
  expansionUrl: string;
  countTotalAfterSeed?: number;
  manualExternalIds?: string[];
};

const TARGETS: readonly Target[] = [
  { code: "svp", expansionUrl: "https://scrydex.com/pokemon/expansions/scarlet-violet-black-star-promos/svp", countTotalAfterSeed: 224 },
  { code: "xyp", expansionUrl: "https://scrydex.com/pokemon/expansions/xy-black-star-promos/xyp" },
  { code: "hgssp", expansionUrl: "https://scrydex.com/pokemon/expansions/hgss-black-star-promos/hsp" },
  { code: "ex5", expansionUrl: "https://scrydex.com/pokemon/expansions/hidden-legends/ex5" },
  {
    code: "ecard2",
    expansionUrl: "https://scrydex.com/pokemon/expansions/aquapolis/ecard2",
    countTotalAfterSeed: 182,
    manualExternalIds: ["ecard2-103"],
  },
] as const;

type MissingListing = {
  localId: string;
  externalId: string;
  variant: string;
  path: string;
};

type TcgdexCard = {
  id?: string;
  localId?: string;
  name?: string;
  rarity?: string | null;
  category?: string;
  stage?: string | null;
  hp?: number | null;
  types?: string[];
  dexId?: number[];
  illustrator?: string | null;
  regulationMark?: string | null;
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
  artist: string | null;
  imageUrl: string;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function normalizeCategory(category: string | undefined | null): string | null {
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

function parseScrydexListingCards(html: string): Array<{
  path: string;
  externalId: string;
  variant: string;
  num: string;
}> {
  const pattern = /href="([^"]*\/pokemon\/cards\/[^/]+\/([^"?]+))(?:\?variant=([^"]+))?"[^>]*>[\s\S]*?<span class="text-body-12 text-white text-center">([^<]+?)\s+#([^<]+)<\/span>/giu;
  const bestByExternalId = new Map<string, { path: string; externalId: string; variant: string; num: string; score: number }>();

  for (const match of html.matchAll(pattern)) {
    const path = match[1];
    const externalId = match[2];
    const variant = (match[3] ?? "default").trim().toLowerCase();
    const num = stripTags(match[5]);
    const score = variant === "holofoil" ? 3 : variant === "default" ? 2 : 1;
    const prev = bestByExternalId.get(externalId);
    if (!prev || score > prev.score) {
      bestByExternalId.set(externalId, { path, externalId, variant, num, score });
    }
  }

  return [...bestByExternalId.values()].map(({ score: _score, ...rest }) => rest);
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
  const titleSource = ogTitleMatch ?? titleMatch;
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
  if (!titleSource || !imageMatch) {
    throw new Error("Failed to parse Scrydex card meta");
  }

  const hpMatch = html.match(/<span class="text-white">HP\s+(\d+)<\/span>/i);
  const artistMatch = html.match(/<div class="mb-2 text-sm text-white">Artist<\/div>[\s\S]*?<div class="text-body-16 text-mono-4">([^<]+)<\/div>/i);
  const rarityMatch = html.match(/<div class="mb-2 text-sm text-white">Rarity<\/div>[\s\S]*?<div class="text-body-16 text-mono-4">([^<]+)<\/div>/i);

  const name = stripTags(titleSource[1]);
  const localId = padLocalId(stripTags(titleSource[2]));
  const visibleTags = parseVisibleTags(html);
  const category = visibleTags.find((value) => ["Pokémon", "Trainer", "Energy"].includes(value)) ?? null;
  const subtypes = visibleTags.filter((value) => value !== category);
  const stage = normalizeStage(subtypes.find((value) => /^(Basic|Stage ?1|Stage ?2)$/i.test(value)) ?? null);

  return {
    name,
    localId,
    rarity: rarityMatch ? stripTags(rarityMatch[1]) : null,
    category,
    stage,
    trainerType: category === "Trainer" ? (subtypes[0] ?? null) : null,
    energyType: category === "Energy" ? (subtypes[0] ?? null) : null,
    hp: hpMatch ? Number.parseInt(hpMatch[1], 10) : null,
    elementTypes: category === "Pokémon" ? parseScrydexTypeNames(html).slice(0, 2) : [],
    artist: artistMatch ? stripTags(artistMatch[1]) : null,
    imageUrl: imageMatch[1].trim(),
  };
}

async function fetchScrydexMissingCards(target: Target, localCards: CardJsonEntry[]): Promise<MissingListing[]> {
  const localIds = new Set(localCards.map((card) => String(card.localId ?? "").trim()).filter(Boolean));
  const html = await fetch(target.expansionUrl, { headers: { "User-Agent": "Mozilla/5.0" } }).then((res) => {
    if (!res.ok) throw new Error(`${target.expansionUrl} -> HTTP ${res.status}`);
    return res.text();
  });
  const all = parseScrydexListingCards(html);
  const withLocalIds = all.map((item) => ({ ...item, localId: padLocalId(item.num) }));

  if (target.manualExternalIds?.length) {
    const wanted = new Set(target.manualExternalIds);
    const localExternalIds = new Set(localCards.map((card) => String(card.externalId ?? "").trim()).filter(Boolean));
    return withLocalIds.filter((item) => wanted.has(item.externalId) && !localExternalIds.has(item.externalId));
  }

  return withLocalIds.filter((item) => !localIds.has(item.localId));
}

async function fetchTcgdexCard(code: string, externalId: string): Promise<TcgdexCard | null> {
  const suffix = externalId.includes("-") ? externalId.slice(externalId.indexOf("-") + 1) : externalId;
  const candidates = [
    `${code}-${suffix}`,
    code === "ecard2" && suffix === "103" ? "ecard2-103b" : null,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${candidate}`);
    if (!res.ok) continue;
    const data = (await res.json()) as TcgdexCard;
    if (data && typeof data === "object" && Object.keys(data).length > 0) return data;
  }

  return null;
}

function nextMasterCardId(): number {
  const files = fs.readdirSync(CARDS_DIR).filter((name) => name.endsWith(".json"));
  return (
    Math.max(
      0,
      ...files.flatMap((file) => {
        const cards = readJson<CardJsonEntry[]>(path.join(CARDS_DIR, file));
        return cards.map((card) => Number.parseInt(card.masterCardId, 10)).filter(Number.isFinite);
      }),
    ) + 1
  );
}

async function buildMissingCard(
  set: SetJsonEntry,
  missing: MissingListing,
  masterCardId: number,
): Promise<CardJsonEntry> {
  const cardHtml = await fetch(`https://scrydex.com${missing.path}?variant=${missing.variant}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((res) => {
    if (!res.ok) throw new Error(`https://scrydex.com${missing.path}?variant=${missing.variant} -> HTTP ${res.status}`);
    return res.text();
  });
  const scrydex = parseScrydexCardMeta(cardHtml);
  const catalogKey = set.setKey.trim();
  const tcgdex = await fetchTcgdexCard(catalogKey, missing.externalId);
  const localId = missing.localId;
  const denominator = set.cardCountOfficial ?? 0;
  const cardNumber = `${localId}/${String(denominator)}`;

  return {
    masterCardId: String(masterCardId),
    externalId: missing.externalId,
    localId,
    setCode: catalogKey,
    cardNumber,
    cardName: scrydex.name,
    fullDisplayName: `${scrydex.name} ${cardNumber} ${set.name}`,
    rarity: tcgdex?.rarity ?? scrydex.rarity,
    category: normalizeCategory(tcgdex?.category ?? scrydex.category),
    hp: typeof tcgdex?.hp === "number" ? tcgdex.hp : scrydex.hp,
    elementTypes: tcgdex?.types ?? scrydex.elementTypes ?? [],
    dexIds: tcgdex?.dexId ?? null,
    trainerType: scrydex.trainerType,
    energyType: scrydex.energyType,
    regulationMark: tcgdex?.regulationMark ?? null,
    artist: tcgdex?.illustrator ?? scrydex.artist,
    imageLowSrc: scrydex.imageUrl,
    imageHighSrc: scrydex.imageUrl,
  };
}

async function main(): Promise<void> {
  const sets = readJson<SetJsonEntry[]>(SETS_FILE);
  const masterCardRef = { current: nextMasterCardId() };

  for (const target of TARGETS) {
    const set = sets.find((entry) => entry.setKey === target.code);
    if (!set) throw new Error(`Missing set entry for ${target.code}`);

    const cardsPath = path.join(CARDS_DIR, `${target.code}.json`);
    const cards = readJson<CardJsonEntry[]>(cardsPath);
    const missing = await fetchScrydexMissingCards(target, cards);

    if (!missing.length) {
      console.log(`${target.code}\t0`);
      continue;
    }

    for (const item of missing) {
      const card = await buildMissingCard(set, item, masterCardRef.current++);
      cards.push(card);
    }

    cards.sort((a, b) => b.cardNumber.localeCompare(a.cardNumber, undefined, { numeric: true }));
    writeJson(cardsPath, cards);

    if (typeof target.countTotalAfterSeed === "number") {
      set.cardCountTotal = target.countTotalAfterSeed;
    }

    console.log(`${target.code}\t${missing.length}`);
  }

  writeJson(SETS_FILE, sets);
}

await main();
