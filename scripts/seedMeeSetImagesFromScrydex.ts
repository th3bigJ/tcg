import nextEnvImport from "@next/env";

/**
 * Fetches Mega Evolution Energy (`mee`) set logo + symbol from Scrydex and attaches them in Payload.
 * TCGdex SDK does not expose `mee`; Scrydex URLs respond with PNG at extensionless paths.
 *
 * Usage: node --import tsx/esm scripts/seedMeeSetImagesFromScrydex.ts
 */

type RelId = number | string;

const LOGO_URL = "https://images.scrydex.com/pokemon/mee/logo";
const SYMBOL_URL = "https://images.scrydex.com/pokemon/mee/symbol";

const getMimeFromContentType = (contentType: string | null): string | undefined => {
  if (!contentType) return undefined;
  const [mime] = contentType.split(";").map((s) => s.trim());
  return mime || undefined;
};

const bytesToFile = (buffer: Buffer, mimetype: string, name: string) => ({
  data: buffer,
  mimetype,
  name,
  size: buffer.byteLength,
});

async function fetchImage(url: string): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const mime = getMimeFromContentType(res.headers.get("content-type"));
  if (!mime || !mime.startsWith("image/")) {
    throw new Error(`Expected image at ${url}, got ${mime ?? "unknown"}`);
  }
  const arr = await res.arrayBuffer();
  const buffer = Buffer.from(arr);
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "bin";
  return { buffer, mime, filename: `mee.${ext}` };
}

export default async function seedMeeSetImagesFromScrydex() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const existing = await payload.find({
    collection: "sets",
    where: { code: { equals: "mee" } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { id: true, name: true, setImage: true, symbolImage: true },
  });

  if (existing.totalDocs === 0) {
    console.error('No set with code "mee". Run npm run seed:set:mee first.');
    process.exit(1);
  }

  const setDoc = existing.docs[0] as {
    id: RelId;
    name?: string;
    setImage?: RelId | { id: RelId } | null;
    symbolImage?: RelId | { id: RelId } | null;
  };

  const currentLogo =
    setDoc.setImage == null
      ? null
      : typeof setDoc.setImage === "object" && "id" in setDoc.setImage
        ? setDoc.setImage.id
        : setDoc.setImage;
  const currentSymbol =
    setDoc.symbolImage == null
      ? null
      : typeof setDoc.symbolImage === "object" && "id" in setDoc.symbolImage
        ? setDoc.symbolImage.id
        : setDoc.symbolImage;

  const setName = setDoc.name ?? "Mega Evolution Energy";
  const updates: { setImage?: RelId; symbolImage?: RelId } = {};

  if (!currentLogo) {
    const { buffer, mime, filename } = await fetchImage(LOGO_URL);
    const logoDoc = await payload.create({
      collection: "set-logo-media",
      data: { alt: `${setName} logo` },
      file: bytesToFile(buffer, mime, filename),
      overrideAccess: true,
    });
    if (logoDoc.id != null) {
      updates.setImage = logoDoc.id;
      console.log(`Created set logo media id=${String(logoDoc.id)}`);
    }
  } else {
    console.log(`Set already has setImage id=${String(currentLogo)} — skipping logo`);
  }

  if (!currentSymbol) {
    const { buffer, mime, filename } = await fetchImage(SYMBOL_URL);
    const symDoc = await payload.create({
      collection: "set-symbol-media",
      data: { alt: `${setName} symbol` },
      file: bytesToFile(buffer, mime, filename.startsWith("mee.") ? `mee-symbol.${filename.split(".").pop()}` : filename),
      overrideAccess: true,
    });
    if (symDoc.id != null) {
      updates.symbolImage = symDoc.id;
      console.log(`Created set symbol media id=${String(symDoc.id)}`);
    }
  } else {
    console.log(`Set already has symbolImage id=${String(currentSymbol)} — skipping symbol`);
  }

  if (Object.keys(updates).length > 0) {
    await payload.update({
      collection: "sets",
      id: setDoc.id,
      data: updates,
      overrideAccess: true,
    });
    console.log(`Updated set id=${String(setDoc.id)} with`, Object.keys(updates).join(", "));
  } else {
    console.log("Nothing to update.");
  }
}

seedMeeSetImagesFromScrydex().catch((err) => {
  console.error(err);
  process.exit(1);
});
