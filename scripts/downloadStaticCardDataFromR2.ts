/**
 * Downloads static JSON from R2 into the repo `data/` tree (overwrites local files).
 *
 * Fetches:
 *   - data/sets.json, data/series.json, data/pokemon.json
 *   - data/cards/{setCode}.json (full prefix list; removes local card JSON not present on R2)
 *   - pricing/… (entire prefix → data/pricing/…, mirrors R2 keys under the bucket)
 *   - Sealed Pokedata: `data/{slug}-products.json` (catalog) + optional `sealed-products/pokedata/…` image-failures (prices/history/trends come from pricing/ mirror)
 *
 * Usage:
 *   npx tsx scripts/downloadStaticCardDataFromR2.ts
 *   DRY_RUN=1 npx tsx scripts/downloadStaticCardDataFromR2.ts
 *
 * Env: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_REGION=auto
 */

import fs from "fs";
import path from "path";
import {
  GetObjectCommand,
  type GetObjectCommandOutput,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { R2_PRICING, R2_SEALED_POKEDATA_DEFAULT_SLUG, r2SealedPokedataCatalogKey } from "../lib/r2BucketLayout";

const ENV_FILE = path.join(process.cwd(), ".env.local");
const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");
const SEALED_DIR = path.join(DATA_DIR, "sealed-products");
const PRICING_DIR = path.join(DATA_DIR, "pricing");
const PRICING_PREFIX = `${R2_PRICING}/`;
const CARDS_PREFIX = "data/cards/";
const ROOT_FILES = ["sets.json", "series.json", "pokemon.json"] as const;

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1);
    if (!process.env[key]) process.env[key] = value;
  }
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

function getBucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

async function bodyToBuffer(body: GetObjectCommandOutput["Body"]): Promise<Buffer> {
  if (!body) throw new Error("Empty response body");
  const transform = typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function" ? (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray : null;
  if (transform) {
    const bytes = await transform();
    return Buffer.from(bytes);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadObject(s3: S3Client, bucket: string, key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return bodyToBuffer(res.Body);
}

async function listAllKeysUnderPrefix(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of out.Contents ?? []) {
      if (obj.Key && !obj.Key.endsWith("/")) keys.push(obj.Key);
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

function sealedImageFailuresKey(slug: string): string {
  return `sealed-products/pokedata/${slug}-image-failures.json`;
}

function removeStaleSealedPricingCopies(slug: string): void {
  for (const name of [`${slug}-prices.json`, `${slug}-price-history.json`, `${slug}-price-trends.json`]) {
    const abs = path.join(SEALED_DIR, name);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
      console.log(`removed stale duplicate (now under data/pricing/): data/sealed-products/${name}`);
    }
  }
}

function collectLocalPricingRelPaths(root: string): string[] {
  const out: string[] = [];
  function walk(sub: string, relPosix: string): void {
    for (const ent of fs.readdirSync(sub, { withFileTypes: true })) {
      const abs = path.join(sub, ent.name);
      const nextRel = relPosix ? `${relPosix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(abs, nextRel);
      else if (ent.isFile() && ent.name.endsWith(".json")) out.push(nextRel);
    }
  }
  if (fs.existsSync(root)) walk(root, "");
  return out;
}

async function main(): Promise<void> {
  loadEnvFile(ENV_FILE);
  const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
  const s3 = buildS3Client();
  const bucket = getBucket();

  const slug = R2_SEALED_POKEDATA_DEFAULT_SLUG;
  const sealedDownloads = [
    { r2Key: r2SealedPokedataCatalogKey(slug), local: path.join(DATA_DIR, `${slug}-products.json`) },
    { r2Key: sealedImageFailuresKey(slug), local: path.join(SEALED_DIR, `${slug}-image-failures.json`), optional: true },
  ] as const;

  const tasks: Array<{ label: string; run: () => Promise<void> }> = [];

  for (const name of ROOT_FILES) {
    const key = `data/${name}`;
    const abs = path.join(DATA_DIR, name);
    tasks.push({
      label: key,
      run: async () => {
        if (dryRun) {
          console.log(`[dry-run] would fetch ${key} → ${path.relative(process.cwd(), abs)}`);
          console.log(`ok: ${key} (dry-run)`);
          return;
        }
        const buf = await downloadObject(s3, bucket, key);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, buf);
        console.log(`ok: ${key} → ${path.relative(process.cwd(), abs)}`);
      },
    });
  }

  tasks.push({
    label: `${CARDS_PREFIX}*`,
    run: async () => {
      const keys = await listAllKeysUnderPrefix(s3, bucket, CARDS_PREFIX);
      const jsonKeys = keys.filter((k) => k.endsWith(".json"));
      if (dryRun) {
        console.log(`[dry-run] would download ${jsonKeys.length} card files under ${CARDS_PREFIX}`);
        console.log(`ok: ${CARDS_PREFIX}* (dry-run)`);
        return;
      }
      fs.mkdirSync(CARDS_DIR, { recursive: true });
      const expectedBasenames = new Set<string>();
      let n = 0;
      for (const key of jsonKeys) {
        n += 1;
        const base = path.basename(key);
        expectedBasenames.add(base);
        const buf = await downloadObject(s3, bucket, key);
        fs.writeFileSync(path.join(CARDS_DIR, base), buf);
        if (n % 50 === 0 || n === jsonKeys.length) {
          console.log(`… cards ${n}/${jsonKeys.length}`);
        }
      }
      const locals = fs.existsSync(CARDS_DIR)
        ? fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"))
        : [];
      for (const f of locals) {
        if (!expectedBasenames.has(f)) {
          fs.unlinkSync(path.join(CARDS_DIR, f));
          console.log(`removed orphan local card file: data/cards/${f}`);
        }
      }
      console.log(`ok: ${jsonKeys.length} files under ${CARDS_PREFIX}`);
    },
  });

  tasks.push({
    label: `${PRICING_PREFIX}*`,
    run: async () => {
      const keys = await listAllKeysUnderPrefix(s3, bucket, PRICING_PREFIX);
      const pricingKeys = keys.filter(
        (k) =>
          !k.endsWith("/") &&
          k.startsWith(PRICING_PREFIX) &&
          k.length > PRICING_PREFIX.length &&
          k.endsWith(".json"),
      );
      if (dryRun) {
        console.log(`[dry-run] would download ${pricingKeys.length} .json objects under ${PRICING_PREFIX}`);
        console.log(`ok: ${PRICING_PREFIX}* (dry-run)`);
        return;
      }
      const expectedRel = new Set<string>();
      let n = 0;
      const total = pricingKeys.length;
      for (const key of pricingKeys) {
        const rel = key.slice(PRICING_PREFIX.length);
        expectedRel.add(rel);
        n += 1;
        const buf = await downloadObject(s3, bucket, key);
        const abs = path.join(PRICING_DIR, ...rel.split("/"));
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, buf);
        if (n % 100 === 0 || n === total) {
          console.log(`… pricing ${n}/${total}`);
        }
      }
      for (const rel of collectLocalPricingRelPaths(PRICING_DIR)) {
        if (!expectedRel.has(rel)) {
          fs.unlinkSync(path.join(PRICING_DIR, ...rel.split("/")));
          console.log(`removed orphan local pricing file: data/pricing/${rel}`);
        }
      }
      removeStaleSealedPricingCopies(slug);
      console.log(`ok: ${expectedRel.size} files under ${PRICING_PREFIX} → data/pricing/`);
    },
  });

  for (const item of sealedDownloads) {
    tasks.push({
      label: item.r2Key,
      run: async () => {
        if (dryRun) {
          console.log(
            `[dry-run] would fetch ${item.r2Key} → ${path.relative(process.cwd(), item.local)}${"optional" in item && item.optional ? " (optional)" : ""}`,
          );
          console.log(`ok: ${item.r2Key} (dry-run)`);
          return;
        }
        try {
          const buf = await downloadObject(s3, bucket, item.r2Key);
          fs.mkdirSync(path.dirname(item.local), { recursive: true });
          fs.writeFileSync(item.local, buf);
          console.log(`ok: ${item.r2Key} → ${path.relative(process.cwd(), item.local)}`);
        } catch (e: unknown) {
          const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
          const name = (e as { name?: string }).name;
          const optional = "optional" in item && item.optional;
          if (optional && (status === 404 || name === "NoSuchKey")) {
            console.log(`skip (not on R2, keeping local if any): ${item.r2Key}`);
            return;
          }
          throw e;
        }
      },
    });
  }

  console.log(`Downloading from R2 bucket ${bucket} (${dryRun ? "dry-run" : "live"})`);
  for (const t of tasks) {
    await t.run();
  }
  console.log("Finished.");
}

await main();
