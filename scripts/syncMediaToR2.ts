import fs from "fs/promises";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import nextEnvImport from "@next/env";

type UploadTask = {
  localPath: string;
  key: string;
};

const { loadEnvConfig } = nextEnvImport as {
  loadEnvConfig: (dir: string, dev: boolean) => unknown;
};

const getContentType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
};

const collectFiles = async (dirPath: string): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) return collectFiles(entryPath);
      return [entryPath];
    }),
  );
  return files.flat();
};

const toPosixPath = (value: string): string => value.split(path.sep).join(path.posix.sep);

const getUploadTasks = async (projectRoot: string): Promise<UploadTask[]> => {
  const tasks: UploadTask[] = [];

  const setLogoDir = path.join(projectRoot, "public", "media", "sets", "logo");
  const setSymbolDir = path.join(projectRoot, "public", "media", "sets", "symbol");
  const cardsDir = path.join(projectRoot, "public", "media", "cards");

  const [setLogoFiles, setSymbolFiles, cardFiles] = await Promise.all([
    collectFiles(setLogoDir),
    collectFiles(setSymbolDir),
    collectFiles(cardsDir),
  ]);

  for (const localPath of setLogoFiles) {
    tasks.push({
      localPath,
      key: toPosixPath(path.posix.join("sets/logo", path.basename(localPath))),
    });
  }

  for (const localPath of setSymbolFiles) {
    tasks.push({
      localPath,
      key: toPosixPath(path.posix.join("sets/symbol", path.basename(localPath))),
    });
  }

  for (const localPath of cardFiles) {
    const relativePath = path.relative(path.join(projectRoot, "public"), localPath);
    tasks.push({
      localPath,
      key: toPosixPath(relativePath),
    });
  }

  return tasks;
};

export default async function syncMediaToR2() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const region = process.env.R2_REGION || "auto";
  const dryRun = process.argv.includes("--dry-run");

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("Missing one or more required env vars: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT");
  }

  const uploadTasks = await getUploadTasks(process.cwd());

  if (uploadTasks.length === 0) {
    console.log("No media files found to upload.");
    return;
  }

  console.log(`Found ${uploadTasks.length} files to sync to R2 bucket "${bucket}".`);

  if (dryRun) {
    for (const task of uploadTasks) {
      console.log(`[dry-run] ${task.localPath} -> ${task.key}`);
    }
    return;
  }

  const client = new S3Client({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    endpoint,
    forcePathStyle: true,
    region,
  });

  let uploaded = 0;

  for (const task of uploadTasks) {
    const fileBody = await fs.readFile(task.localPath);
    await client.send(
      new PutObjectCommand({
        Body: fileBody,
        Bucket: bucket,
        ContentType: getContentType(task.localPath),
        Key: task.key,
      }),
    );
    uploaded += 1;
    if (uploaded % 50 === 0 || uploaded === uploadTasks.length) {
      console.log(`Uploaded ${uploaded}/${uploadTasks.length}`);
    }
  }

  console.log(`Sync complete. Uploaded ${uploaded} files to R2.`);
}

syncMediaToR2().catch((err) => {
  console.error(err);
  process.exit(1);
});
