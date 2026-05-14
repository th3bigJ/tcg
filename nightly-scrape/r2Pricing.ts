import { S3Client } from "@aws-sdk/client-s3";
import {
  normalizeScarletVioletCardKeySetPrefix,
  partitionPokemonCardExternalId,
  scarletVioletLegacyPricingPrefixesByCatalogKey,
} from "./scrydexScarletVioletUrls";
import type { CardPricingEntry, SetPricingMap } from "./staticDataTypes";

export type { CardPricingEntry, SetPricingMap };

export function buildS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT ?? "",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
    region: process.env.R2_REGION ?? "auto",
    maxAttempts: 5,
  });
}

export function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

/**
 * Older price-history / trend maps (and some R2 blobs) keyed cards with TCGdex-style set prefixes
 * (`me01-…`, `me02-…`, `me02.5-…`) while the catalog uses Scrydex `setKey` (`me1`, `me2`, `me2pt5`).
 * Scarlet & Violet zero-padded / dotted legacy prefixes come from `scrydexScarletVioletUrls`.
 */
const CATALOG_PREFIX_TO_LEGACY_PRICING_PREFIXES: Record<string, readonly string[]> = {
  ...scarletVioletLegacyPricingPrefixesByCatalogKey(),
  me1: ["me01"],
  me2: ["me02"],
  me2pt5: ["me02.5"],
};

export function buildPricingLookupIds(externalId: string): string[] {
  const id = externalId.trim();
  if (!id) return [];

  const ids = new Set<string>([id, id.toLowerCase()]);
  const { prefix: setPrefix, suffix } = partitionPokemonCardExternalId(id);
  if (!suffix) return Array.from(ids);

  const canonSetPrefix = normalizeScarletVioletCardKeySetPrefix(setPrefix);

  ids.add(`${canonSetPrefix}-${suffix}`);
  ids.add(`${canonSetPrefix}-${suffix}`.toLowerCase());

  const legacyPrefixes = CATALOG_PREFIX_TO_LEGACY_PRICING_PREFIXES[canonSetPrefix];
  if (legacyPrefixes) {
    for (const lp of legacyPrefixes) {
      ids.add(`${lp}-${suffix}`);
      ids.add(`${lp}-${suffix}`.toLowerCase());
    }
  }

  if (/^\d+$/u.test(suffix)) {
    const n = Number.parseInt(suffix, 10);
    if (Number.isFinite(n)) {
      ids.add(`${setPrefix}-${n}`);
      ids.add(`${setPrefix.toLowerCase()}-${n}`);
      ids.add(`${canonSetPrefix}-${n}`);
      ids.add(`${canonSetPrefix}-${n}`.toLowerCase());
      if (legacyPrefixes) {
        for (const lp of legacyPrefixes) {
          ids.add(`${lp}-${n}`);
          ids.add(`${lp}-${n}`.toLowerCase());
        }
      }
    }
  }

  return Array.from(ids);
}

export function setCodeFromExternalId(id: string): string {
  const parts = id.trim().split("-");
  return parts.length > 1 ? parts.slice(0, -1).join("-") : id.trim();
}

/**
 * Look up a single card's pricing from a pre-fetched set pricing map.
 * Returns null if no pricing found for this card.
 */
export function getPricingForCard(
  pricingMap: SetPricingMap,
  externalId: string,
  fallbackIds?: string[],
): CardPricingEntry | null {
  for (const id of buildPricingLookupIds(externalId)) {
    const match = pricingMap[id];
    if (match) return match;
  }

  if (fallbackIds) {
    for (const fallbackId of fallbackIds) {
      for (const id of buildPricingLookupIds(fallbackId)) {
        const match = pricingMap[id];
        if (match) return match;
      }
    }
  }

  return null;
}
