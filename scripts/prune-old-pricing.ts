import fs from "fs";
import path from "path";
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

// Calculate boundary keys
const now = new Date();
const minDaily = new Date(now.getTime() - 31 * 86400000).toISOString().split("T")[0];
const minMonthly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 60, 1)).toISOString().slice(0, 7);

// Simple week calculation helper for bounds
function getIsoWeekYear(d: Date) {
  const date = new Date(d.getTime());
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
const minWeekly = getIsoWeekYear(new Date(now.getTime() - 52 * 7 * 86400000));

async function prunePrefix(prefix: string, isTooOld: (key: string) => boolean) {
  console.log(`Scanning R2 prefix: ${prefix}...`);
  let continuationToken: string | undefined;
  const toDelete: string[] = [];

  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents ?? []) {
      if (obj.Key && isTooOld(obj.Key)) {
        toDelete.push(obj.Key);
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  if (!toDelete.length) {
    console.log(`  No objects older than cutoff found.`);
    return;
  }

  console.log(`  Deleting ${toDelete.length} expired objects...`);
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000).map((Key) => ({ Key }));
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch } }));
  }
  console.log(`  Done.`);
}

function pruneLocalDir(subDir: string, isTooOld: (name: string) => boolean) {
  const fullPath = path.join(process.cwd(), "r2_backup", subDir);
  if (!fs.existsSync(fullPath)) return;

  console.log(`Scanning local directory: r2_backup/${subDir}...`);
  const entries = fs.readdirSync(fullPath);
  let deletedCount = 0;

  for (const entry of entries) {
    if (isTooOld(entry)) {
      const entryPath = path.join(fullPath, entry);
      fs.rmSync(entryPath, { recursive: true, force: true });
      deletedCount += 1;
    }
  }

  if (deletedCount > 0) {
    console.log(`  Deleted ${deletedCount} expired local items.`);
  } else {
    console.log(`  No local items older than cutoff found.`);
  }
}

async function main() {
  console.log(`Pruning objects older than:\n  Daily: ${minDaily}\n  Weekly: ${minWeekly}\n  Monthly: ${minMonthly}\n`);
  
  // 1. Prune R2 Storage
  console.log("=== Pruning R2 Storage ===");
  await prunePrefix("new_pricing/daily/", (k) => {
    const p = k.split("/"); return p[2] < minDaily;
  });
  await prunePrefix("new_pricing/weekly/", (k) => {
    const p = k.split("/"); return p[2] < minWeekly;
  });
  await prunePrefix("new_pricing/monthly/", (k) => {
    const p = k.split("/"); return p[2] < minMonthly;
  });

  await prunePrefix("new_pricing/sealed/daily/", (k) => {
    const file = k.split("/").pop() || ""; return file.slice(0, 10) < minDaily;
  });
  await prunePrefix("new_pricing/sealed/weekly/", (k) => {
    const file = k.split("/").pop() || ""; return file.slice(0, 8) < minWeekly;
  });
  await prunePrefix("new_pricing/sealed/monthly/", (k) => {
    const file = k.split("/").pop() || ""; return file.slice(0, 7) < minMonthly;
  });

  // 2. Prune Local Filesystem (`r2_backup/new_pricing/`)
  console.log("\n=== Pruning Local Mirror ===");
  pruneLocalDir("new_pricing/daily", (name) => name < minDaily);
  pruneLocalDir("new_pricing/weekly", (name) => name < minWeekly);
  pruneLocalDir("new_pricing/monthly", (name) => name < minMonthly);

  pruneLocalDir("new_pricing/sealed/daily", (name) => name.slice(0, 10) < minDaily);
  pruneLocalDir("new_pricing/sealed/weekly", (name) => name.slice(0, 8) < minWeekly);
  pruneLocalDir("new_pricing/sealed/monthly", (name) => name.slice(0, 7) < minMonthly);
  
  console.log("\nPruning complete.");
}

main().catch(console.error);
