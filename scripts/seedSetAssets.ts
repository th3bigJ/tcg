import TCGdex from "@tcgdex/sdk";
import nextEnvImport from "@next/env";

type TCGdexSetBrief = {
  id: string;
  name: string;
  logo?: string | null;
  symbol?: string | null;
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const extFromUrl = (url: string): string | undefined => {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const last = path.split("/").filter(Boolean).pop();
    if (!last) return undefined;
    const dot = last.lastIndexOf(".");
    if (dot === -1) return undefined;
    return last.slice(dot + 1);
  } catch {
    return undefined;
  }
};

const getMimeFromContentType = (contentType: string | null): string | undefined => {
  if (!contentType) return undefined;
  const [mime] = contentType.split(";").map((s) => s.trim());
  return mime || undefined;
};

const toAssetUrlWithExtension = (baseUrl: string, ext: string) => {
  // TCGdex returns base URLs for set assets without extension (e.g. .../logo)
  // so we reconstruct the actual image URL by appending .webp/.png/.jpg.
  if (/\.(png|webp|jpg|jpeg|svg)$/i.test(baseUrl)) return baseUrl;
  return `${baseUrl}.${ext}`;
};

const fetchImageBuffer = async (baseUrl: string) => {
  const preferredExts = ["webp", "png", "jpg"] as const;
  let lastErr: unknown = null;

  for (const ext of preferredExts) {
    const url = toAssetUrlWithExtension(baseUrl, ext);
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} fetching ${url}`);
        continue;
      }
      const contentType = res.headers.get("content-type");
      const mime = getMimeFromContentType(contentType);
      if (!mime || !mime.startsWith("image/")) {
        lastErr = new Error(`Non-image mime ${mime ?? "unknown"} for ${url}`);
        continue;
      }
      const arr = await res.arrayBuffer();
      const buffer = Buffer.from(arr);
      return { buffer, mime, ext };
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Failed to fetch image from baseUrl=${baseUrl}`);
};

const bytesToFile = (buffer: Buffer, mimetype: string, name: string) => ({
  data: buffer,
  mimetype,
  name,
  size: buffer.byteLength,
});

export default async function seedSetAssets() {
  // Ensure `.env.local` is loaded when running via `node` (outside Next's runtime).
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const dryRun = process.argv.includes("--dry-run");
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const setArg = getArg("set");

  const tcgdex = new TCGdex("en");

  const payload = dryRun
    ? null
    : await (async () => {
        const payloadConfig = (await import("../payload.config")).default;
        const { getPayload } = await import("payload");
        return getPayload({ config: payloadConfig });
      })();

  const logoCollection = "set-logo-media";
  const symbolCollection = "set-symbol-media";

  const sets = (await tcgdex.set.list()) as unknown as TCGdexSetBrief[];
  const filteredSets = setArg ? sets.filter((s) => s.id === setArg) : sets;

  const totalSets = filteredSets.length;
  const toProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? Math.min(totalSets, limit)
      : totalSets;

  if (!dryRun && toProcess > 0) {
    console.log(`Seeding set assets for ${toProcess}/${totalSets} sets...`);
  }

  let logoCreated = 0;
  let symbolCreated = 0;
  let setsUpdated = 0;
  let setsSkipped = 0;

  for (let i = 0; i < toProcess; i++) {
    const tcgSet = filteredSets[i];
    const setId = tcgSet.id;

    const setDoc = dryRun
      ? null
      : await payload!.find({
          collection: "sets",
          where: { code: { equals: setId } },
          limit: 1,
          select: { id: true, setImage: true, symbolImage: true },
          overrideAccess: true,
        });

    const setRecord = setDoc?.docs?.[0] ?? null;
    if (!dryRun && !setRecord) {
      setsSkipped++;
      console.warn(`No Payload Set found for code=${setId}. Skipping.`);
      continue;
    }

    const currentSetImageId =
      dryRun || !setRecord
        ? null
        : typeof (setRecord as any).setImage === "string"
          ? (setRecord as any).setImage
          : (setRecord as any).setImage?.id ?? null;

    const currentSymbolImageId =
      dryRun || !setRecord
        ? null
        : typeof (setRecord as any).symbolImage === "string"
          ? (setRecord as any).symbolImage
          : (setRecord as any).symbolImage?.id ?? null;

    const setName = tcgSet.name ?? setId;

    // Logo
    let logoMediaId: string | null = null;
    if (tcgSet.logo) {
      if (dryRun || !currentSetImageId) {
        const { buffer: logoBuffer, mime, ext } = await fetchImageBuffer(
          tcgSet.logo,
        );
        const logoName = `${setId}.${ext}`;

        if (!dryRun) {
          const logoDoc = await payload!.create({
            collection: logoCollection,
            data: {
              alt: `${setName} logo`,
            },
            file: bytesToFile(logoBuffer, mime, logoName),
            overrideAccess: true,
          });

          logoMediaId = logoDoc.id == null ? null : String(logoDoc.id);
          logoCreated++;
        }
      }
    }

    // Symbol
    let symbolMediaId: string | null = null;
    if (tcgSet.symbol) {
      if (dryRun || !currentSymbolImageId) {
        const { buffer: symbolBuffer, mime, ext } = await fetchImageBuffer(
          tcgSet.symbol,
        );
        const symbolName = `${setId}.${ext}`;

        if (!dryRun) {
          const symbolDoc = await payload!.create({
            collection: symbolCollection,
            data: {
              alt: `${setName} symbol`,
            },
            file: bytesToFile(symbolBuffer, mime, symbolName),
            overrideAccess: true,
          });

          symbolMediaId = symbolDoc.id == null ? null : String(symbolDoc.id);
          symbolCreated++;
        }
      }
    }

    if (!dryRun && setRecord && (logoMediaId || symbolMediaId)) {
      await payload!.update({
        collection: "sets",
        id: setRecord.id,
        data: {
          ...(logoMediaId ? { setImage: logoMediaId } : {}),
          ...(symbolMediaId ? { symbolImage: symbolMediaId } : {}),
        },
        overrideAccess: true,
      });

      setsUpdated++;
    }

    if (dryRun) {
      console.log(`[dry-run] set=${setId} logo=${tcgSet.logo ? "yes" : "no"} symbol=${tcgSet.symbol ? "yes" : "no"}`);
    } else {
      console.log(
        `Processed ${i + 1}/${toProcess}: ${setName} (${setId})`,
      );
    }
  }

  if (!dryRun) {
    console.log("");
    console.log("Seed set assets complete");
    console.log(`Logo created: ${logoCreated}`);
    console.log(`Symbol created: ${symbolCreated}`);
    console.log(`Sets updated: ${setsUpdated}`);
    console.log(`Sets skipped: ${setsSkipped}`);
    if (payload) {
      await payload.destroy();
    }
    process.exit(0);
  }
}

seedSetAssets().catch((err) => {
  console.error(err);
  process.exit(1);
});

