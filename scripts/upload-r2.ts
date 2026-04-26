import fs from "fs";
import path from "path";
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
const inputDir = path.join(process.cwd(), "r2_backup");

async function getAllFiles(dir: string, allFiles: string[] = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      await getAllFiles(name, allFiles);
    } else {
      allFiles.push(name);
    }
  }
  return allFiles;
}

async function upload() {
  console.log(`Uploading from ${inputDir} to bucket ${bucketName}...`);
  if (!fs.existsSync(inputDir)) {
    console.error(`Directory ${inputDir} does not exist.`);
    return;
  }

  const files = await getAllFiles(inputDir);
  let count = 0;

  for (const filePath of files) {
    const relativePath = path.relative(inputDir, filePath);
    
    // Normalize path for S3 keys (forward slashes)
    const key = relativePath.split(path.sep).join("/");
    
    console.log(`Uploading ${key}...`);
    
    const fileBuffer = fs.readFileSync(filePath);
    
    let contentType = "application/octet-stream";
    if (key.endsWith(".json")) contentType = "application/json";
    else if (key.endsWith(".txt")) contentType = "text/plain";

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
        })
      );
      count++;
    } catch (err) {
      console.error(`Failed to upload ${key}:`, err);
    }
  }

  console.log(`Uploaded ${count} files.`);
}

upload().catch(console.error);
