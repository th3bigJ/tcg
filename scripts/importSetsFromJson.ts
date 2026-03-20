import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";
import type { Payload } from "payload";

type JsonSet = {
  id: string;
  name: string;
  series?: string;
  printedTotal?: number;
  total?: number;
  releaseDate?: string;
  images?: {
    symbol?: string;
    logo?: string;
  };
};

type ExistingSetDoc = {
  id: number | string;
  code?: string | null;
  symbolImage?: number | string | { id?: number | string } | null;
  setImage?: number | string | { id?: number | string } | null;
};

type RelId = number | string;

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseReleaseDateToISO = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}T00:00:00.000Z`;
};

const bytesToFile = (buffer: Buffer, mimetype: string, name: string) => ({
  data: buffer,
  mimetype,
  name,
  size: buffer.byteLength,
});

const getMimeFromContentType = (contentType: string | null): string | undefined => {
  if (!contentType) return undefined;
  const [mime] = contentType.split(";").map((part) => part.trim());
  return mime || undefined;
};

const extFromMime = (mime: string): string => {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/gif") return "gif";
  return "bin";
};

const fetchImageBuffer = async (url: string): Promise<{ buffer: Buffer; mime: string; ext: string }> => {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${url}`);
  }

  const mime = getMimeFromContentType(response.headers.get("content-type"));
  if (!mime || !mime.startsWith("image/")) {
    throw new Error(`Expected image content type for ${url}, got ${mime ?? "unknown"}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, mime, ext: extFromMime(mime) };
};

const relationshipToId = (
  value: number | string | { id?: number | string } | null | undefined,
): RelId | null => {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value.id === "string" || typeof value.id === "number") return value.id;
  return null;
};

const ensureSeriesId = async (
  payload: Payload,
  cache: Map<string, RelId>,
  seriesNameRaw: string | undefined,
): Promise<RelId | undefined> => {
  const seriesName = (seriesNameRaw || "").trim();
  if (!seriesName) return undefined;

  const key = seriesName.toLowerCase();
  const fromCache = cache.get(key);
  if (fromCache) return fromCache;

  const existing = await payload.find({
    collection: "series",
    where: {
      name: {
        equals: seriesName,
      },
    },
    limit: 1,
    select: { id: true },
    overrideAccess: true,
  });

  if (existing.totalDocs > 0) {
    const id = existing.docs[0].id;
    cache.set(key, id);
    return id;
  }

  const created = await payload.create({
    collection: "series",
    data: {
      name: seriesName,
      slug: slugify(seriesName),
      isActive: true,
    },
    overrideAccess: true,
  });

  const id = created.id;
  cache.set(key, id);
  return id;
};

const createMediaIfMissing = async ({
  payload,
  shouldCreate,
  collection,
  imageUrl,
  alt,
  fileBaseName,
  dryRun,
}: {
  payload: Payload;
  shouldCreate: boolean;
  collection: "set-symbol-media" | "set-logo-media";
  imageUrl: string | undefined;
  alt: string;
  fileBaseName: string;
  dryRun: boolean;
}): Promise<RelId | undefined> => {
  if (!shouldCreate || !imageUrl) return undefined;
  if (dryRun) return undefined;

  const { buffer, mime, ext } = await fetchImageBuffer(imageUrl);
  const fileName = `${fileBaseName}.${ext}`;

  const created = await payload.create({
    collection,
    data: { alt },
    file: bytesToFile(buffer, mime, fileName),
    overrideAccess: true,
  });

  if (created.id == null) return undefined;
  return created.id;
};

const loadSetsJson = async (filePath: string): Promise<JsonSet[]> => {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array in ${filePath}`);
  }
  return parsed as JsonSet[];
};

export default async function importSetsFromJson() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const dryRun = process.argv.includes("--dry-run");
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const brandSlug = getArg("brand") || "pokemon";
  const fileArg = getArg("file");
  const sourceFile = fileArg
    ? path.resolve(process.cwd(), fileArg)
    : path.resolve(process.cwd(), "data/sets/en.json");

  const payload = dryRun
    ? null
    : await (async () => {
        const payloadConfig = (await import("../payload.config")).default;
        const { getPayload } = await import("payload");
        return getPayload({ config: payloadConfig });
      })();

  const sets = await loadSetsJson(sourceFile);
  const toProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? sets.slice(0, limit)
      : sets;

  let brandId: RelId | undefined;
  if (!dryRun) {
    const brand = await payload!.find({
      collection: "brands",
      where: {
        slug: {
          equals: brandSlug,
        },
      },
      limit: 1,
      select: { id: true, name: true, slug: true },
      overrideAccess: true,
    });

    if (brand.totalDocs === 0) {
      throw new Error(
        `No brand found for slug "${brandSlug}". Create it first or pass --brand=<slug>.`,
      );
    }

    brandId = brand.docs[0].id;
  }

  const seriesIdCache = new Map<string, RelId>();

  let createdSets = 0;
  let updatedSets = 0;
  let skippedSets = 0;
  let createdLogos = 0;
  let createdSymbols = 0;
  let errors = 0;

  for (let index = 0; index < toProcess.length; index++) {
    const setRow = toProcess[index];
    const code = setRow.id?.trim();
    const name = setRow.name?.trim();
    if (!code || !name) {
      skippedSets++;
      console.warn(`Skipping row ${index + 1}: missing set id or name.`);
      continue;
    }

    try {
      const releaseDateISO = parseReleaseDateToISO(setRow.releaseDate);
      const seriesId = dryRun
        ? undefined
        : await ensureSeriesId(payload!, seriesIdCache, setRow.series);

      const commonData: Record<string, unknown> = {
        name,
        code,
        brand: dryRun ? "dry-run-brand-id" : brandId,
        releaseDate: releaseDateISO,
        cardCountTotal: typeof setRow.total === "number" ? setRow.total : undefined,
        cardCountOfficial:
          typeof setRow.printedTotal === "number" ? setRow.printedTotal : undefined,
        serieName: seriesId,
        isActive: true,
      };

      if (dryRun) {
        console.log(`[dry-run] upsert set code=${code}`, commonData);
        continue;
      }

      const existing = await payload!.find({
        collection: "sets",
        where: {
          code: {
            equals: code,
          },
        },
        limit: 1,
        select: {
          id: true,
          code: true,
          symbolImage: true,
          setImage: true,
        },
        overrideAccess: true,
      });

      let setId: RelId;
      let existingSet: ExistingSetDoc | null = null;

      if (existing.totalDocs > 0) {
        existingSet = existing.docs[0] as ExistingSetDoc;
        await payload!.update({
          collection: "sets",
          id: existingSet.id,
          data: commonData,
          overrideAccess: true,
        });
        setId = existingSet.id;
        updatedSets++;
      } else {
        const created = await payload!.create({
          collection: "sets",
          data: commonData,
          overrideAccess: true,
        });
        setId = created.id;
        createdSets++;
      }

      const hasSymbol = relationshipToId(existingSet?.symbolImage) != null;
      const hasLogo = relationshipToId(existingSet?.setImage) != null;

      const symbolId = await createMediaIfMissing({
        payload: payload!,
        shouldCreate: !hasSymbol,
        collection: "set-symbol-media",
        imageUrl: setRow.images?.symbol,
        alt: `${name} symbol`,
        fileBaseName: `${code}-symbol`,
        dryRun,
      });

      if (symbolId) {
        createdSymbols++;
      }

      const logoId = await createMediaIfMissing({
        payload: payload!,
        shouldCreate: !hasLogo,
        collection: "set-logo-media",
        imageUrl: setRow.images?.logo,
        alt: `${name} logo`,
        fileBaseName: `${code}-logo`,
        dryRun,
      });

      if (logoId) {
        createdLogos++;
      }

      if (symbolId || logoId) {
        await payload!.update({
          collection: "sets",
          id: setId,
          data: {
            ...(symbolId ? { symbolImage: symbolId } : {}),
            ...(logoId ? { setImage: logoId } : {}),
          },
          overrideAccess: true,
        });
      }

      console.log(`Processed ${index + 1}/${toProcess.length}: ${name} (${code})`);
    } catch (error) {
      errors++;
      console.error(`Failed processing set at index ${index + 1} (${setRow.id}):`, error);
    }
  }

  console.log("");
  console.log(`Import complete (${dryRun ? "dry-run" : "write mode"})`);
  console.log(`Sets created: ${createdSets}`);
  console.log(`Sets updated: ${updatedSets}`);
  console.log(`Sets skipped: ${skippedSets}`);
  console.log(`Symbol media created: ${createdSymbols}`);
  console.log(`Logo media created: ${createdLogos}`);
  console.log(`Errors: ${errors}`);

  if (!dryRun && payload) {
    await payload.destroy();
    process.exit(errors > 0 ? 1 : 0);
  }
}

importSetsFromJson().catch((err) => {
  console.error(err);
  process.exit(1);
});
