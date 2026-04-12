import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export function buildAdminS3Client(): S3Client {
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

function getAdminR2Bucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

export async function getJsonFromR2<T>(key: string): Promise<T | null> {
  const s3 = buildAdminS3Client();
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: getAdminR2Bucket(),
        Key: key,
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

export async function putJsonToR2(key: string, value: unknown): Promise<void> {
  const s3 = buildAdminS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getAdminR2Bucket(),
      Key: key,
      Body: JSON.stringify(value, null, 2) + "\n",
      ContentType: "application/json; charset=utf-8",
    }),
  );
}
