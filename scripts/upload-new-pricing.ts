import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { loadEnvFilesFromRepoRoot } from "../nightly-scrape/loadEnvFromRepoRoot.js";

loadEnvFilesFromRepoRoot(import.meta.url);

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  region: process.env.R2_REGION || "auto",
  forcePathStyle: true,
});

const bucket = process.env.R2_BUCKET!;
const inputDir = path.join(process.cwd(), "r2_backup/new_pricing");

function getAllFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) getAllFiles(full, files);
    else files.push(full);
  }
  return files;
}

async function upload() {
  const files = getAllFiles(inputDir);
  console.log(`Uploading ${files.length} files from new_pricing/ to R2...`);
  let uploaded = 0;
  let failed = 0;

  for (const filePath of files) {
    const key = "new_pricing/" + path.relative(inputDir, filePath).split(path.sep).join("/");
    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fs.readFileSync(filePath),
        ContentType: "application/json",
      }));
      uploaded++;
      if (uploaded % 50 === 0) console.log(`  ${uploaded}/${files.length}...`);
    } catch (err) {
      console.error(`  Failed: ${key}`, err);
      failed++;
    }
  }

  console.log(`\nDone. ${uploaded} uploaded, ${failed} failed.`);
}

upload().catch((e) => { console.error(e); process.exit(1); });
