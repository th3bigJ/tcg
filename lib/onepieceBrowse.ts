import { getPublicMediaBaseUrl, resolveMediaURL } from "@/lib/media";

export type OnePieceSetRecord = {
  id?: string;
  setCode: string;
  name: string;
  releaseDate?: string;
  cardCount?: number;
  imagePath?: string;
  setType?: string;
};

export type OnePieceCardRecord = {
  tcgplayerProductId?: string;
  cardNumber: string;
  name: string;
  setCode: string;
  variant?: string;
  rarity: string;
  cardType?: string[];
  color?: string[];
  cost?: number | null;
  power?: number | null;
  counter?: number | null;
  life?: number | null;
  attribute?: string[];
  subtypes?: string[];
  effect?: string;
  imagePath?: string;
  imageUrl?: string;
};

function assertAbsoluteFetchUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      "R2 public base URL is not configured (set R2_PUBLIC_BASE_URL or NEXT_PUBLIC_R2_PUBLIC_BASE_URL).",
    );
  }
  return url;
}

/** Absolute URL for a catalog path under the public bucket (e.g. `onepiece/sets/data/sets.json`). */
export function publicBucketUrl(relativePath: string): string {
  const trimmed = relativePath.replace(/^\/+/, "");
  const base = getPublicMediaBaseUrl();
  if (!base) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return `${base.replace(/\/+$/, "")}/${trimmed}`;
}

/**
 * Absolute URL for an object key/path in the public bucket.
 * Use `mediaBaseUrl` from {@link getPublicMediaBaseUrl} so browser bundles resolve images
 * (server-only `R2_PUBLIC_BASE_URL` is not available in client components).
 */
export function onePiecePublicAssetUrl(mediaBaseUrl: string, imagePath: string | null | undefined): string {
  if (!imagePath?.trim()) return "";
  const p = imagePath.trim();
  if (/^https?:\/\//i.test(p)) return p;
  const base = mediaBaseUrl.replace(/\/+$/, "");
  return `${base}/${p.replace(/^\/+/, "")}`;
}

/** Server-safe URL helper using {@link resolveMediaURL} (env-aware). */
export function onePieceImageSrcFromRecord(imagePath: string | null | undefined): string {
  if (!imagePath?.trim()) return "";
  return resolveMediaURL(imagePath.trim());
}

export async function fetchOnePieceSetsFromR2(): Promise<OnePieceSetRecord[]> {
  const url = assertAbsoluteFetchUrl(publicBucketUrl("onepiece/sets/data/sets.json"));
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`One Piece sets fetch failed: ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return data as OnePieceSetRecord[];
}

export async function fetchOnePieceCardsFromR2(setCode: string): Promise<OnePieceCardRecord[]> {
  const code = setCode.trim().toUpperCase();
  if (!code) return [];
  const url = assertAbsoluteFetchUrl(publicBucketUrl(`onepiece/cards/data/${code}.json`));
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`One Piece cards fetch failed for ${code}: ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return data as OnePieceCardRecord[];
}
