/** Download specific R2 keys into r2_backup/. Usage: npx tsx --env-file=.env.local scripts/pull-r2-keys.ts key1 key2 */
import fs from "fs";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { loadEnvFilesFromRepoRoot } from "../nightly-scrape/loadEnvFromRepoRoot.js";

loadEnvFilesFromRepoRoot(import.meta.url);

const keys = process.argv.slice(2);
if (!keys.length) {
  console.error("Usage: pull-r2-keys.ts <r2-key> …");
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

async function main(): Promise<void> {
  for (const key of keys) {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await res.Body?.transformToByteArray();
    if (!body) throw new Error(`Empty body: ${key}`);
    const dest = path.join(process.cwd(), "r2_backup", key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(body));
    console.log(`${key} → ${dest} (${body.length} bytes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
