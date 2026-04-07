import fs from "fs";
import path from "path";
import type { CardJsonEntry, SetJsonEntry } from "../lib/staticDataTypes";

const TARGET_SET_IDS = new Set(["2014xy", "2015xy", "2017sm", "2018sm"]);
const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");

type TcgdexSetSummary = {
  id: string;
  cards?: Array<{ id: string; localId: string; name: string }>;
};

type TcgdexCard = {
  id: string;
  localId?: string;
  name: string;
  rarity?: string | null;
  category?: string;
  dexId?: number[];
  hp?: number | null;
  types?: string[];
  stage?: string | null;
  illustrator?: string | null;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  const sets = readJson<SetJsonEntry[]>(path.join(DATA_DIR, "sets.json"));
  const existingFiles = fs.readdirSync(CARDS_DIR).filter((name) => name.endsWith(".json"));
  let nextMasterCardId =
    Math.max(
      ...existingFiles.flatMap((file) => {
        const cards = readJson<CardJsonEntry[]>(path.join(CARDS_DIR, file));
        return cards.map((card) => Number.parseInt(card.masterCardId, 10)).filter(Number.isFinite);
      }),
    ) + 1;

  for (const set of sets) {
    const setId = (set.setKey ?? "").trim();
    if (!TARGET_SET_IDS.has(setId)) continue;

    const filePath = path.join(CARDS_DIR, `${setId}.json`);
    const existingCards = fs.existsSync(filePath) ? readJson<CardJsonEntry[]>(filePath) : [];
    if (existingCards.length > 0) continue;

    const setSummary = await fetchJson<TcgdexSetSummary>(`https://api.tcgdex.net/v2/en/sets/${setId}`);
    const officialCount = set.cardCountOfficial ?? set.cardCountTotal ?? setSummary.cards?.length ?? null;
    const cards: CardJsonEntry[] = [];

    for (const cardSummary of setSummary.cards ?? []) {
      const detail = await fetchJson<TcgdexCard>(`https://api.tcgdex.net/v2/en/cards/${cardSummary.id}`);
      const localId = padLocalId(detail.localId ?? cardSummary.localId);
      const countDenominator = officialCount != null ? String(officialCount) : localId;
      const printedNumber = localId ? `${localId}/${countDenominator}` : countDenominator;
      const category = normalizeCategory(detail.category);

      cards.push({
        masterCardId: String(nextMasterCardId++),
        externalId: null,
        localId,
        setCode: setId,
        cardNumber: printedNumber,
        cardName: detail.name,
        fullDisplayName: `${detail.name} ${printedNumber} ${set.name}`,
        rarity: detail.rarity ?? null,
        category,
        hp: typeof detail.hp === "number" ? detail.hp : null,
        elementTypes: detail.types ?? [],
        dexIds: detail.dexId ?? null,
        trainerType: null,
        energyType: null,
        regulationMark: null,
        artist: detail.illustrator ?? null,
        imageLowSrc: "",
        imageHighSrc: null,
      });
    }

    cards.sort((a, b) => b.localId.localeCompare(a.localId, undefined, { numeric: true }));
    writeJson(filePath, cards);
    console.log(`${setId}\t${cards.length}`);
  }
}

await main();
