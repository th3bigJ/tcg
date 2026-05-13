import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

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

const PREFIXES_TO_DELETE = [
  "new_pricing/daily/",
  "new_pricing/weekly/",
  "new_pricing/monthly/",
];

async function listAllKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const res: any = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function deleteKeys(keys: string[]): Promise<void> {
  // S3 DeleteObjects accepts max 1000 keys per call
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000).map((Key) => ({ Key }));
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: batch },
    }));
  }
}

async function main() {
  for (const prefix of PREFIXES_TO_DELETE) {
    console.log(`\nListing R2 objects under ${prefix}...`);
    const keys = await listAllKeys(prefix);
    if (keys.length === 0) {
      console.log(`  Nothing found.`);
      continue;
    }
    console.log(`  Found ${keys.length} objects — deleting...`);
    await deleteKeys(keys);
    console.log(`  Deleted.`);
  }
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
