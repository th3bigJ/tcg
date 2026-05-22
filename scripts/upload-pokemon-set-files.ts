/**
 * Upload specific Pokémon set JSON + card images from r2_backup to R2.
 * Usage: npx tsx --env-file=.env.local scripts/upload-pokemon-set-files.ts me4 mep
 */

import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { loadEnvFilesFromRepoRoot } from "../nightly-scrape/loadEnvFromRepoRoot.js";

loadEnvFilesFromRepoRoot(import.meta.url);

const argv = process.argv.slice(2);
const jsonOnly = argv.includes("--json-only");
const setCodes = argv.filter((a) => !a.startsWith("--")).map((s) => s.trim().toLowerCase()).filter(Boolean);
if (!setCodes.length) {
  console.error("Usage: upload-pokemon-set-files.ts me4 mep [--json-only]");
  process.exit(1);
}

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT ?? "",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  region: process.env.R2_REGION ?? "auto",
  forcePathStyle: true,
});

const bucket = process.env.R2_BUCKET?.trim();
if (!bucket) throw new Error("R2_BUCKET not set");

const root = path.join(process.cwd(), "r2_backup");

async function put(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  console.log(`  ${key}`);
}

async function main(): Promise<void> {
  await put("data/sets.json", fs.readFileSync(path.join(root, "data/sets.json")), "application/json");

  for (const code of setCodes) {
    const cardJson = path.join(root, "data/cards", `${code}.json`);
    if (!fs.existsSync(cardJson)) throw new Error(`Missing ${cardJson}`);
    await put(`data/cards/${code}.json`, fs.readFileSync(cardJson), "application/json");
  }

  if (!jsonOnly) {
    const cardsDir = path.join(root, "cards");
    const prefixes = setCodes.map((c) => `${c}-`);
    const images = fs.readdirSync(cardsDir).filter((f) => prefixes.some((p) => f.startsWith(p)));
    console.log(`Uploading ${images.length} images…`);
    let n = 0;
    for (const f of images) {
      await put(`cards/${f}`, fs.readFileSync(path.join(cardsDir, f)), "image/png");
      if (++n % 50 === 0) console.log(`  …${n}/${images.length}`);
    }
    console.log(`Done (${images.length} images + JSON).`);
  } else {
    console.log("Done (JSON only).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
