import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

type PayloadClient = Awaited<ReturnType<(typeof import("payload"))["getPayload"]>>;

const { loadEnvConfig } = nextEnvImport as {
  loadEnvConfig: (dir: string, dev: boolean) => unknown;
};

type FileUpload = {
  data: Buffer;
  mimetype: string;
  name: string;
  size: number;
};

const getImageFiles = async (dirPath: string): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

const parseDexIdFromFileName = (filePath: string): number | null => {
  const base = path.basename(filePath, path.extname(filePath));
  if (!/^\d+$/.test(base)) return null;
  const value = Number(base);
  return Number.isInteger(value) && value > 0 ? value : null;
};

const ensurePokemonBucket = async (): Promise<void> => {
  const bucket = process.env.R2_POKEMON_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const region = process.env.R2_REGION || "auto";

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error(
      "Missing required env vars for Pokemon bucket setup: R2_POKEMON_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT",
    );
  }

  const client = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
    forcePathStyle: true,
    region,
  });

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`R2 bucket "${bucket}" already exists.`);
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created R2 bucket "${bucket}".`);
  }
};

const toFileUpload = async (filePath: string): Promise<FileUpload> => {
  const data = await fs.readFile(filePath);
  return {
    data,
    mimetype: "image/png",
    name: path.basename(filePath),
    size: data.byteLength,
  };
};

const getPayloadClient = async (): Promise<PayloadClient> => {
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  return getPayload({ config: payloadConfig });
};

const hasExistingDexMedia = async (
  payload: PayloadClient,
  dexId: number,
): Promise<boolean> => {
  const existing = await payload.find({
    collection: "pokemon-media",
    where: {
      dexId: { equals: dexId },
    },
    limit: 1,
    overrideAccess: true,
  });

  return existing.totalDocs > 0;
};

export default async function setupPokemonMedia() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  await ensurePokemonBucket();

  const imagesDir = path.resolve(process.cwd(), "public/media/images");
  const files = await getImageFiles(imagesDir);

  if (files.length === 0) {
    console.log("No PNG files found in public/media/images.");
    return;
  }

  const payload = await getPayloadClient();

  let created = 0;
  let skipped = 0;

  for (const filePath of files) {
    const dexId = parseDexIdFromFileName(filePath);
    if (!dexId) {
      skipped += 1;
      console.warn(`Skipping "${path.basename(filePath)}": no numeric dex id in filename.`);
      continue;
    }

    const exists = await hasExistingDexMedia(payload, dexId);
    if (exists) {
      skipped += 1;
      continue;
    }

    const file = await toFileUpload(filePath);

    await payload.create({
      collection: "pokemon-media",
      data: {
        alt: `Pokemon #${dexId}`,
        dexId,
      },
      file,
      overrideAccess: true,
    });

    created += 1;
    if (created % 100 === 0) {
      console.log(`Created ${created} Pokemon media records...`);
    }
  }

  await payload.destroy();

  console.log(`Pokemon media setup complete. Created: ${created}, skipped: ${skipped}`);
}

setupPokemonMedia().catch((error) => {
  console.error(error);
  process.exit(1);
});
