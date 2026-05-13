import fs from "fs";
import path from "path";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  region: process.env.R2_REGION || "auto",
  forcePathStyle: true,
});

const bucketName = process.env.R2_BUCKET!;
const outputDir = path.join(process.cwd(), "r2_backup");
const CONCURRENCY = 20;

function shouldSkip(key: string): boolean {
  if (key.startsWith("images/") || key.includes("/images/") || key.endsWith("/")) return true;
  const ext = path.extname(key).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext);
}

async function listAllKeys(): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response: any = await s3.send(
      new ListObjectsV2Command({ Bucket: bucketName, ContinuationToken: continuationToken }),
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key && !shouldSkip(obj.Key)) keys.push(obj.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function downloadKey(key: string): Promise<boolean> {
  const filePath = path.join(outputDir, key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
    const arr = await res.Body?.transformToByteArray();
    if (arr) {
      fs.writeFileSync(filePath, Buffer.from(arr));
      return true;
    }
    return false;
  } catch (err) {
    console.error(`Failed: ${key}`, err);
    return false;
  }
}

async function pool(keys: string[], concurrency: number): Promise<number> {
  let next = 0;
  let downloaded = 0;

  async function worker() {
    while (next < keys.length) {
      const key = keys[next++];
      const ok = await downloadKey(key);
      if (ok) {
        downloaded++;
        console.log(`[${downloaded}/${keys.length}] ${key}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, keys.length) }, worker));
  return downloaded;
}

async function download() {
  console.log(`Listing objects in ${bucketName}...`);
  const keys = await listAllKeys();
  console.log(`Found ${keys.length} non-image files. Downloading with concurrency=${CONCURRENCY}...`);

  const count = await pool(keys, CONCURRENCY);
  console.log(`Done. Downloaded ${count} files to ${outputDir}`);
}

download().catch(console.error);
