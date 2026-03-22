import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";

/**
 * Uploads `data/set-assets/mega-evolution-energy-logo.webp` as the set logo for code `mee`
 * (Mega Evolution Energy). Replace that file to change the artwork.
 *
 * Usage: node --import tsx/esm scripts/seedMeeSetLogoFromLocalAsset.ts
 */

type RelId = number | string;

const ASSET_REL = path.join("data", "set-assets", "mega-evolution-energy-logo.webp");

export default async function seedMeeSetLogoFromLocalAsset() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const abs = path.join(process.cwd(), ASSET_REL);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(abs);
  } catch {
    console.error(`Missing file: ${ASSET_REL}`);
    process.exit(1);
  }

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const existing = await payload.find({
    collection: "sets",
    where: { code: { equals: "mee" } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { id: true, name: true },
  });

  if (existing.totalDocs === 0) {
    console.error('No set with code "mee". Run npm run seed:set:mee first.');
    process.exit(1);
  }

  const setDoc = existing.docs[0] as { id: RelId; name?: string };
  const setName = setDoc.name ?? "Mega Evolution Energy";

  const logoDoc = await payload.create({
    collection: "set-logo-media",
    data: { alt: `${setName} logo` },
    file: {
      data: buffer,
      mimetype: "image/webp",
      name: "mee-logo.webp",
      size: buffer.byteLength,
    },
    overrideAccess: true,
  });

  if (logoDoc.id == null) {
    console.error("Failed to create logo media");
    process.exit(1);
  }

  await payload.update({
    collection: "sets",
    id: setDoc.id,
    data: { setImage: logoDoc.id },
    overrideAccess: true,
  });

  console.log(
    `Updated set id=${String(setDoc.id)} (mee) with new setImage id=${String(logoDoc.id)} from ${ASSET_REL}`,
  );
}

seedMeeSetLogoFromLocalAsset().catch((err) => {
  console.error(err);
  process.exit(1);
});
