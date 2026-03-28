import { readFileSync } from "node:fs";
import path from "node:path";

import { hexHammingDistance, rgbDistance, type CardVisualFingerprint } from "@/lib/cardVisualHash";

type CardImageHashEntry = {
  masterCardId: string;
  setCode: string;
  cardNumber: string;
  cardName: string;
  imageUrl: string;
  width: number;
  height: number;
  dHash: string;
  aHash: string;
  avgRgb: [number, number, number];
};

type CardImageHashIndex = {
  generatedAt: string;
  source: "imageLowSrc";
  count: number;
  failedCount: number;
  hashes: CardImageHashEntry[];
  failed: Array<unknown>;
};

export type VisualMatch = {
  masterCardId: string;
  visualScore: number;
  dHashDistance: number;
  aHashDistance: number;
  colorDistance: number;
};

let cachedIndex: CardImageHashIndex | null = null;

function getCardImageHashIndex(): CardImageHashIndex {
  if (cachedIndex) return cachedIndex;

  const filePath = path.join(process.cwd(), "data", "card-image-hashes.json");
  const content = readFileSync(filePath, "utf8");
  cachedIndex = JSON.parse(content) as CardImageHashIndex;
  return cachedIndex;
}

export function findVisualCardMatches(
  fingerprint: CardVisualFingerprint,
  options?: {
    allowedMasterCardIds?: Set<string> | null;
    limit?: number;
  },
): VisualMatch[] {
  const allowedMasterCardIds = options?.allowedMasterCardIds ?? null;
  const limit = options?.limit ?? 120;
  const index = getCardImageHashIndex();

  const matches = index.hashes
    .filter((entry) => !allowedMasterCardIds || allowedMasterCardIds.has(entry.masterCardId))
    .map((entry) => {
      const dHashDistance = hexHammingDistance(fingerprint.dHash, entry.dHash);
      const aHashDistance = hexHammingDistance(fingerprint.aHash, entry.aHash);
      const colorDistance = rgbDistance(fingerprint.avgRgb, entry.avgRgb);
      const visualScore = dHashDistance * 1.8 + aHashDistance * 1.1 + colorDistance / 18;

      return {
        masterCardId: entry.masterCardId,
        visualScore,
        dHashDistance,
        aHashDistance,
        colorDistance,
      };
    })
    .sort((left, right) => left.visualScore - right.visualScore);

  return matches.slice(0, limit);
}
