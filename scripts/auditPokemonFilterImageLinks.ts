import nextEnvImport from "@next/env";

type PokemonDoc = {
  id: number | string;
  name?: string | null;
  nationalDexNumber?: number | null;
  imageFilename?: string | null;
  imageUrl?: string | null;
  pokemonMedia?: {
    id?: number | string;
    filename?: string | null;
    url?: string | null;
    dexId?: number | null;
  } | null;
};

type PokemonMediaDoc = {
  id: number | string;
  filename?: string | null;
  dexId?: number | null;
  url?: string | null;
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const buildDefaultFilenames = (): string[] => {
  const values: string[] = [];
  for (let i = 1; i <= 60; i += 1) {
    values.push(`${i}-1.png`);
  }
  return values;
};

const unique = (values: string[]): string[] => [...new Set(values)];

const toFilenameList = (): string[] => {
  const arg = getArg("filenames");
  if (!arg) return buildDefaultFilenames();
  return unique(
    arg
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
};

async function auditPokemonFilterImageLinks() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const targetFilenames = toFilenameList();

  const pokemonResult = await payload.find({
    collection: "pokemon",
    depth: 1,
    limit: 1200,
    page: 1,
    overrideAccess: true,
    select: {
      name: true,
      nationalDexNumber: true,
      imageFilename: true,
      imageUrl: true,
      pokemonMedia: true,
    },
    sort: "nationalDexNumber",
  });

  const mediaResult = await payload.find({
    collection: "pokemon-media",
    depth: 0,
    limit: 2000,
    page: 1,
    overrideAccess: true,
    select: {
      filename: true,
      dexId: true,
      url: true,
    },
  });

  const pokemonDocs = pokemonResult.docs as PokemonDoc[];
  const mediaDocs = mediaResult.docs as PokemonMediaDoc[];

  const mediaByFilename = new Map<string, PokemonMediaDoc[]>();
  for (const doc of mediaDocs) {
    const filename = typeof doc.filename === "string" ? doc.filename.trim() : "";
    if (!filename) continue;
    const list = mediaByFilename.get(filename) ?? [];
    list.push(doc);
    mediaByFilename.set(filename, list);
  }

  const pokemonByImageFilename = new Map<string, PokemonDoc[]>();
  for (const doc of pokemonDocs) {
    const filename = typeof doc.imageFilename === "string" ? doc.imageFilename.trim() : "";
    if (!filename) continue;
    const list = pokemonByImageFilename.get(filename) ?? [];
    list.push(doc);
    pokemonByImageFilename.set(filename, list);
  }

  const report = targetFilenames.map((filename) => {
    const pokemonMatches = pokemonByImageFilename.get(filename) ?? [];
    const mediaMatches = mediaByFilename.get(filename) ?? [];
    return {
      filename,
      pokemonCount: pokemonMatches.length,
      mediaCount: mediaMatches.length,
      pokemonExamples: pokemonMatches.slice(0, 2).map((doc) => ({
        dex: doc.nationalDexNumber ?? null,
        name: doc.name ?? null,
        imageFilename: doc.imageFilename ?? null,
        imageUrl: doc.imageUrl ?? null,
        relationFilename: doc.pokemonMedia?.filename ?? null,
      })),
      mediaExamples: mediaMatches.slice(0, 2).map((doc) => ({
        id: doc.id,
        dexId: doc.dexId ?? null,
        filename: doc.filename ?? null,
        url: doc.url ?? null,
      })),
    };
  });

  const missingInPokemon = report.filter((row) => row.pokemonCount === 0).map((row) => row.filename);
  const missingInMedia = report.filter((row) => row.mediaCount === 0).map((row) => row.filename);

  console.log("=== Pokemon filter image audit ===");
  console.log(`Checked filenames: ${targetFilenames.length}`);
  console.log(`Missing in pokemon.imageFilename: ${missingInPokemon.length}`);
  console.log(`Missing in pokemon-media.filename: ${missingInMedia.length}`);

  if (missingInPokemon.length > 0) {
    console.log("Missing in pokemon.imageFilename (first 20):");
    console.log(missingInPokemon.slice(0, 20).join(", "));
  }

  if (missingInMedia.length > 0) {
    console.log("Missing in pokemon-media.filename (first 20):");
    console.log(missingInMedia.slice(0, 20).join(", "));
  }

  const firstInteresting = report.find((row) => row.pokemonCount === 0 || row.mediaCount === 0);
  if (firstInteresting) {
    console.log("Sample problematic row:");
    console.log(JSON.stringify(firstInteresting, null, 2));
  }

  await payload.destroy();
}

auditPokemonFilterImageLinks().catch((error) => {
  console.error(error);
  process.exit(1);
});
