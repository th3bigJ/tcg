import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";

type PokemonCsvRow = {
  name: string;
  nationalDexNumber: number;
  primaryTyping: string;
  secondaryTyping: string | null;
  secondaryTypingFlag: boolean;
  generation: string;
  legendaryStatus: boolean;
  form: string;
  altFormFlag: boolean;
  evolutionStage: number | null;
  numberOfEvolution: number | null;
  colorId: string | null;
  catchRate: number | null;
  heightDm: number | null;
  weightHg: number | null;
  heightIn: number | null;
  weightLbs: number | null;
  baseStatTotal: number | null;
  health: number | null;
  attack: number | null;
  defense: number | null;
  specialAttack: number | null;
  specialDefense: number | null;
  speed: number | null;
};

type PokemonMediaRow = {
  id: number;
  dexId: number;
  filename?: string | null;
  prefix?: string | null;
};

const { loadEnvConfig } = nextEnvImport as {
  loadEnvConfig: (dir: string, dev: boolean) => unknown;
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
};

const toNullableNumber = (value: string): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value: string): boolean => value.trim().toLowerCase() === "true";

const toNullableText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const resolvePokemonMediaURL = (relativePath: string): string => {
  const explicitBase =
    process.env.R2_POKEMON_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_POKEMON_PUBLIC_BASE_URL ||
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL;

  if (!explicitBase) return relativePath;
  return `${trimTrailingSlash(explicitBase)}/${relativePath.replace(/^\/+/, "")}`;
};

const parseRows = (csvText: string): PokemonCsvRow[] => {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);

    return {
      name: values[0],
      nationalDexNumber: Number(values[1]),
      primaryTyping: values[2],
      secondaryTyping: toNullableText(values[3]),
      secondaryTypingFlag: toBoolean(values[4]),
      generation: values[5],
      legendaryStatus: toBoolean(values[6]),
      form: values[7],
      altFormFlag: toBoolean(values[8]),
      evolutionStage: toNullableNumber(values[9]),
      numberOfEvolution: toNullableNumber(values[10]),
      colorId: toNullableText(values[11]),
      catchRate: toNullableNumber(values[12]),
      heightDm: toNullableNumber(values[13]),
      weightHg: toNullableNumber(values[14]),
      heightIn: toNullableNumber(values[15]),
      weightLbs: toNullableNumber(values[16]),
      baseStatTotal: toNullableNumber(values[17]),
      health: toNullableNumber(values[18]),
      attack: toNullableNumber(values[19]),
      defense: toNullableNumber(values[20]),
      specialAttack: toNullableNumber(values[21]),
      specialDefense: toNullableNumber(values[22]),
      speed: toNullableNumber(values[23]),
    };
  });
};

const getPokemonMediaMap = async (
  payload: Awaited<ReturnType<(typeof import("payload"))["getPayload"]>>,
): Promise<Map<number, PokemonMediaRow>> => {
  const map = new Map<number, PokemonMediaRow>();
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await payload.find({
      collection: "pokemon-media",
      depth: 0,
      limit: 200,
      page,
      overrideAccess: true,
    });

    for (const doc of result.docs) {
      const mediaDoc = doc as unknown as PokemonMediaRow;
      if (!map.has(mediaDoc.dexId)) {
        map.set(mediaDoc.dexId, mediaDoc);
      }
    }

    hasNextPage = result.hasNextPage;
    page += 1;
  }

  return map;
};

export default async function importPokemonCsv() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const csvPath = path.resolve(process.cwd(), "data/all_pokemon_data.csv");
  const csvText = await fs.readFile(csvPath, "utf8");
  const rows = parseRows(csvText);

  if (rows.length === 0) {
    console.log("No Pokemon rows found in CSV.");
    await payload.destroy();
    return;
  }

  const mediaMap = await getPokemonMediaMap(payload);

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const media = mediaMap.get(row.nationalDexNumber);
    const filename = media?.filename || `${row.nationalDexNumber}.png`;
    const prefix = media?.prefix || "";
    const imagePath = prefix ? `${prefix.replace(/\/+$/, "")}/${filename}` : filename;
    const imageUrl = resolvePokemonMediaURL(imagePath);

    const existing = await payload.find({
      collection: "pokemon",
      where: {
        and: [
          { name: { equals: row.name } },
          { nationalDexNumber: { equals: row.nationalDexNumber } },
          { form: { equals: row.form } },
        ],
      },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    });

    const data = {
      ...row,
      pokemonMedia: media?.id ?? null,
      imageFilename: filename,
      imagePath,
      imageUrl,
    };

    if (existing.totalDocs > 0 && existing.docs[0]?.id) {
      await payload.update({
        collection: "pokemon",
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      });
      updated += 1;
    } else {
      await payload.create({
        collection: "pokemon",
        data,
        overrideAccess: true,
      });
      created += 1;
    }
  }

  await payload.destroy();

  console.log(
    `Pokemon CSV import complete. Processed ${rows.length} rows (created: ${created}, updated: ${updated}).`,
  );
}

importPokemonCsv().catch((error) => {
  console.error(error);
  process.exit(1);
});
