import { unstable_cache } from "next/cache";

import { resolveMediaURL, resolvePokemonMediaURL } from "@/lib/media";
import { resolveCanonicalSetCodeFromFields } from "@/lib/setCanonicalCode";

type ImageRelation = {
  url?: string | null;
  filename?: string | null;
};

export type SetFilterOption = {
  code: string;
  name: string;
  logoSrc: string;
  symbolSrc: string;
  releaseYear: number | null;
  seriesName: string;
  cardCountOfficial: number | null;
  cardCountTotal: number | null;
};

export type PokemonFilterOption = {
  nationalDexNumber: number;
  name: string;
  imageUrl: string;
};

const isImageRelation = (value: unknown): value is ImageRelation =>
  Boolean(value) && typeof value === "object";

const looksLikeFilename = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes("/") || /^https?:\/\//i.test(trimmed)) return false;
  return /\.[a-z0-9]+$/i.test(trimmed);
};

async function getSetFilterOptions(setCodes: string[]): Promise<SetFilterOption[]> {
  if (setCodes.length === 0) return [];

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const result = await payload.find({
    collection: "sets",
    depth: 1,
    limit: setCodes.length,
    overrideAccess: true,
    select: {
      code: true,
      tcgdexId: true,
      name: true,
      setImage: true,
      symbolImage: true,
      releaseDate: true,
      cardCountTotal: true,
      cardCountOfficial: true,
      serieName: true,
    },
    where: {
      and: [
        {
          or: [
            { code: { in: setCodes } },
            { tcgdexId: { in: setCodes } },
          ],
        },
        {
          setImage: {
            exists: true,
          },
        },
      ],
    },
  });

  return result.docs
    .map((doc) => {
      const code = resolveCanonicalSetCodeFromFields({
        tcgdexId: doc.tcgdexId,
        code: doc.code,
      });
      const name = typeof doc.name === "string" ? doc.name : code;
      const image = isImageRelation(doc.setImage) ? doc.setImage : null;
      const imageUrl = typeof image?.url === "string" ? image.url : "";
      const symbolImage = isImageRelation(doc.symbolImage) ? doc.symbolImage : null;
      const symbolUrl = typeof symbolImage?.url === "string" ? symbolImage.url : "";
      const releaseYear =
        typeof doc.releaseDate === "string" ? new Date(doc.releaseDate).getUTCFullYear() : null;
      const seriesName =
        typeof doc.serieName === "object" &&
        doc.serieName &&
        "name" in doc.serieName &&
        typeof doc.serieName.name === "string"
          ? doc.serieName.name
          : "Uncategorized";
      const cardCountOfficial =
        typeof doc.cardCountOfficial === "number" ? doc.cardCountOfficial : null;
      const cardCountTotal = typeof doc.cardCountTotal === "number" ? doc.cardCountTotal : null;
      if (!code || !imageUrl) return null;
      return {
        code,
        name,
        logoSrc: resolveMediaURL(imageUrl),
        symbolSrc: symbolUrl ? resolveMediaURL(symbolUrl) : "",
        releaseYear: Number.isFinite(releaseYear) ? releaseYear : null,
        seriesName,
        cardCountOfficial,
        cardCountTotal,
      };
    })
    .filter((option): option is SetFilterOption => Boolean(option))
    .sort((a, b) => {
      const yearA = a.releaseYear ?? 0;
      const yearB = b.releaseYear ?? 0;
      if (yearA !== yearB) return yearB - yearA;
      return a.name.localeCompare(b.name);
    });
}

async function getPokemonFilterOptions(): Promise<PokemonFilterOption[]> {
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const result = await payload.find({
    collection: "pokemon",
    depth: 1,
    limit: 1200,
    page: 1,
    overrideAccess: true,
    select: {
      nationalDexNumber: true,
      name: true,
      pokemonMedia: true,
      imageFilename: true,
      imageUrl: true,
    },
    sort: "nationalDexNumber",
  });

  const deduped = new Map<number, PokemonFilterOption>();

  for (const doc of result.docs) {
    const dex = typeof doc.nationalDexNumber === "number" ? doc.nationalDexNumber : null;
    const name = typeof doc.name === "string" ? doc.name.trim() : "";
    const imageFilename = typeof doc.imageFilename === "string" ? doc.imageFilename.trim() : "";
    const mediaRelation = isImageRelation(doc.pokemonMedia) ? doc.pokemonMedia : null;
    const mediaFilename =
      typeof mediaRelation?.filename === "string" ? mediaRelation.filename.trim() : "";
    const mediaUrl = typeof mediaRelation?.url === "string" ? mediaRelation.url.trim() : "";
    const fallbackUrl = typeof doc.imageUrl === "string" ? doc.imageUrl.trim() : "";
    const resolvedFilename = imageFilename || mediaFilename;
    const imageUrl = resolvedFilename
      ? resolvePokemonMediaURL(resolvedFilename)
      : looksLikeFilename(fallbackUrl)
        ? resolvePokemonMediaURL(fallbackUrl)
        : resolvePokemonMediaURL(fallbackUrl || mediaUrl);
    if (!dex || !name || !imageUrl || deduped.has(dex)) continue;
    deduped.set(dex, { nationalDexNumber: dex, name, imageUrl });
  }

  return [...deduped.values()].sort(
    (a, b) => a.nationalDexNumber - b.nationalDexNumber || a.name.localeCompare(b.name),
  );
}

export const getCachedSetFilterOptions = unstable_cache(
  async (setCodes: string[]) => getSetFilterOptions(setCodes),
  ["cards-page-set-filter-options-v2"],
  { revalidate: 300 },
);

export const getCachedPokemonFilterOptions = unstable_cache(
  async () => getPokemonFilterOptions(),
  ["cards-page-pokemon-filter-options-v1"],
  { revalidate: 300 },
);
