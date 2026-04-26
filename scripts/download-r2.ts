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

async function download() {
  console.log(`Downloading from bucket ${bucketName} to ${outputDir}...`);
  let isTruncated = true;
  let continuationToken: string | undefined = undefined;

  let count = 0;

  while (isTruncated) {
    const response: any = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents || []) {
      const key = object.Key;
      if (!key) continue;

      // Exclude images based on prefix or extension
      if (key.startsWith("images/") || key.includes("/images/") || key.endsWith("/")) {
        continue;
      }
      
      const ext = path.extname(key).toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext)) {
        continue;
      }

      console.log(`Downloading ${key}...`);
      
      const filePath = path.join(outputDir, key);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      try {
        const getResp = await s3.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
          })
        );
        
        const arr = await getResp.Body?.transformToByteArray();
        if (arr) {
            fs.writeFileSync(filePath, Buffer.from(arr));
            count++;
        }
      } catch (err) {
        console.error(`Failed to download ${key}:`, err);
      }
    }

    isTruncated = response.IsTruncated ?? false;
    continuationToken = response.NextContinuationToken;
  }

  console.log(`Downloaded ${count} non-image files.`);
}

download().catch(console.error);
