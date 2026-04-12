import fs from "fs";
import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const LORCANA_R2_PREFIX = "lorcana" as const;

export function buildLorcanaS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT ?? "",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
    region: process.env.R2_REGION ?? "auto",
  });
}

export function getLorcanaR2Bucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

export function lorcanaR2Key(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  return `${LORCANA_R2_PREFIX}/${clean}`;
}

export function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function putBufferToLorcanaR2(
  s3: S3Client,
  relativePath: string,
  body: Buffer | string,
  contentType?: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: getLorcanaR2Bucket(),
      Key: lorcanaR2Key(relativePath),
      Body: body,
      ContentType: contentType ?? guessContentType(relativePath),
    }),
  );
}

export async function uploadLocalFileToLorcanaR2(
  s3: S3Client,
  absolutePath: string,
  relativePath: string,
): Promise<void> {
  const body = fs.readFileSync(absolutePath);
  await putBufferToLorcanaR2(s3, relativePath, body, guessContentType(absolutePath));
}

export async function putJsonToLorcanaR2(
  s3: S3Client,
  relativePath: string,
  value: unknown,
): Promise<void> {
  await putBufferToLorcanaR2(
    s3,
    relativePath,
    JSON.stringify(value, null, 2) + "\n",
    "application/json; charset=utf-8",
  );
}

export async function getJsonFromLorcanaR2<T>(
  s3: S3Client,
  relativePath: string,
): Promise<T | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: getLorcanaR2Bucket(),
        Key: lorcanaR2Key(relativePath),
      }),
    );
    const raw = await result.Body?.transformToString();
    if (!raw?.trim()) return null;
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const name = (error as { name?: string }).name;
    if (status === 404 || name === "NoSuchKey") return null;
    throw error;
  }
}
