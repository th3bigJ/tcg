import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  type PortfolioSnapshotDocument,
  type PortfolioSnapshotPoint,
  parsePortfolioSnapshotDocument,
} from "@/lib/portfolioSnapshotTypes";

export type { PortfolioSnapshotDocument, PortfolioSnapshotPoint } from "@/lib/portfolioSnapshotTypes";

const SNAPSHOT_VERSION = 1 as const;
/** Daily snapshots: ~5 years at one point per day. */
const MAX_POINTS = 5 * 365;

function getPortfolioSnapshotBaseUrl(): string {
  const base =
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
    "";
  return base.replace(/\/+$/, "");
}

function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

function buildS3Client(): S3Client {
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

export function portfolioSnapshotObjectKey(customerId: string): string {
  return `portfolio-snapshots/${customerId}.json`;
}

export async function fetchPortfolioSnapshotDocumentFromPublicUrl(
  customerId: string,
): Promise<PortfolioSnapshotDocument | null> {
  const base = getPortfolioSnapshotBaseUrl();
  if (!base) return null;

  const url = `${base}/${portfolioSnapshotObjectKey(customerId)}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: process.env.NODE_ENV === "development" ? 0 : 60 },
    });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    return parsePortfolioSnapshotDocument(raw, customerId);
  } catch {
    return null;
  }
}

/** Reads snapshot JSON via S3 API (same credentials as upload). Use when public URL is unset or unreachable from the server. */
export async function fetchPortfolioSnapshotDocumentFromBucket(
  customerId: string,
): Promise<PortfolioSnapshotDocument | null> {
  if (!process.env.R2_BUCKET || !process.env.R2_ENDPOINT) return null;
  try {
    const s3 = buildS3Client();
    const out = await s3.send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: portfolioSnapshotObjectKey(customerId),
      }),
    );
    const body = await out.Body?.transformToString();
    if (!body) return null;
    const raw: unknown = JSON.parse(body);
    return parsePortfolioSnapshotDocument(raw, customerId);
  } catch {
    return null;
  }
}

/**
 * Server-side load: try public URL first, then R2 GetObject. Covers dashboards when only bucket credentials exist in env.
 */
export async function fetchPortfolioSnapshotDocumentForServer(
  customerId: string,
): Promise<PortfolioSnapshotDocument | null> {
  return (
    (await fetchPortfolioSnapshotDocumentFromPublicUrl(customerId)) ??
    (await fetchPortfolioSnapshotDocumentFromBucket(customerId))
  );
}

export function mergePortfolioSnapshotPoint(
  existing: PortfolioSnapshotDocument | null,
  point: PortfolioSnapshotPoint,
  customerId: string,
): PortfolioSnapshotDocument {
  const prev = existing?.points ?? [];
  const withoutDate = prev.filter((p) => p.date !== point.date);
  const nextPoints = [...withoutDate, point].sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = nextPoints.slice(-MAX_POINTS);

  return {
    version: SNAPSHOT_VERSION,
    customerId,
    updatedAt: new Date().toISOString(),
    points: trimmed,
  };
}

export async function putPortfolioSnapshotDocument(doc: PortfolioSnapshotDocument): Promise<void> {
  const s3 = buildS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: portfolioSnapshotObjectKey(doc.customerId),
      Body: JSON.stringify(doc),
      ContentType: "application/json",
    }),
  );
}

/** Loads existing doc from R2 (if any), merges the new daily point, uploads. */
export async function mergeAndUploadPortfolioSnapshot(
  customerId: string,
  point: PortfolioSnapshotPoint,
): Promise<PortfolioSnapshotDocument> {
  const existing =
    (await fetchPortfolioSnapshotDocumentFromPublicUrl(customerId)) ??
    (await fetchPortfolioSnapshotDocumentFromBucket(customerId));
  const doc = mergePortfolioSnapshotPoint(existing, point, customerId);
  await putPortfolioSnapshotDocument(doc);
  return doc;
}
