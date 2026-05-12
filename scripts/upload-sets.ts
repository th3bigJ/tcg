import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

async function upload() {
  console.log(`Uploading sets.json to bucket ${bucketName}...`);
  const fileBuffer = fs.readFileSync("r2_backup/data/sets.json");
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: "data/sets.json",
      Body: fileBuffer,
      ContentType: "application/json",
    })
  );
  console.log("Done.");
}

upload().catch(console.error);
