import { readFileSync } from "node:fs";
import path from "node:path";

import { hexHammingDistance, rgbDistance, type CardVisualFingerprint } from "@/lib/cardVisualHash";

type SetSymbolHashEntry = {
  id: string;
  name: string;
  code: string | null;
  tcgdexId: string | null;
  symbolUrl: string;
  width: number;
  height: number;
  dHash: string;
  aHash: string;
  avgRgb: [number, number, number];
};

type SetSymbolHashIndex = {
  generatedAt: string;
  count: number;
  hashes: SetSymbolHashEntry[];
};

export type SetSymbolMatch = {
  setCode: string | null;
  setTcgdexId: string | null;
  visualScore: number;
  dHashDistance: number;
  aHashDistance: number;
  colorDistance: number;
};

let cachedIndex: SetSymbolHashIndex | null = null;

function getSetSymbolHashIndex(): SetSymbolHashIndex {
  if (cachedIndex) return cachedIndex;
  const filePath = path.join(process.cwd(), "data", "set-symbol-hashes.json");
  cachedIndex = JSON.parse(readFileSync(filePath, "utf8")) as SetSymbolHashIndex;
  return cachedIndex;
}

export function findSetSymbolMatches(
  fingerprint: CardVisualFingerprint,
  limit = 16,
): SetSymbolMatch[] {
  const index = getSetSymbolHashIndex();

  return index.hashes
    .map((entry) => {
      const dHashDistance = hexHammingDistance(fingerprint.dHash, entry.dHash);
      const aHashDistance = hexHammingDistance(fingerprint.aHash, entry.aHash);
      const colorDistance = rgbDistance(fingerprint.avgRgb, entry.avgRgb);
      const visualScore = dHashDistance * 2.2 + aHashDistance * 1.25 + colorDistance / 20;

      return {
        setCode: entry.code,
        setTcgdexId: entry.tcgdexId,
        visualScore,
        dHashDistance,
        aHashDistance,
        colorDistance,
      };
    })
    .sort((left, right) => left.visualScore - right.visualScore)
    .slice(0, limit);
}
