import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

import { getRelationshipDocumentId } from "../lib/relationshipId";

type PayloadClient = Awaited<ReturnType<typeof import("payload").getPayload>>;

type SetRow = {
  id: string | number;
  tcgdexId?: string;
};

const tcgdex = new TCGdex("en");

const LEGACY_SET_PREFIX_NORMALIZATION: Record<string, string> = {
  me1: "me01",
  me2: "me02",
  me2pt5: "me02.5",
};

function extractPricing(card: unknown): { tcgplayer: unknown; cardmarket: unknown } {
  if (!card || typeof card !== "object" || !("pricing" in card)) {
    return { tcgplayer: null, cardmarket: null };
  }
  const pricing = (card as { pricing?: unknown }).pricing;
  if (!pricing || typeof pricing !== "object") {
    return { tcgplayer: null, cardmarket: null };
  }
  const row = pricing as { tcgplayer?: unknown; cardmarket?: unknown };
  return {
    tcgplayer: row.tcgplayer ?? null,
    cardmarket: row.cardmarket ?? null,
  };
}

function normalizePrefix(id: string): string[] {
  const values = new Set<string>();
  values.add(id);
  const splitIndex = id.indexOf("-");
  if (splitIndex <= 0) return Array.from(values);

  const prefix = id.slice(0, splitIndex);
  const suffix = id.slice(splitIndex + 1);
  const normalizedPrefix = LEGACY_SET_PREFIX_NORMALIZATION[prefix];
  if (normalizedPrefix && suffix) {
    values.add(`${normalizedPrefix}-${suffix}`);
  }

  return Array.from(values);
}

function buildCandidateIds(input: {
  externalId: string;
  localId?: string;
  setTcgdexId?: string;
}): string[] {
  const ids = new Set<string>();
  const externalId = input.externalId.trim();
  const localId = input.localId?.trim() ?? "";
  const setTcgdexId = input.setTcgdexId?.trim() ?? "";

  if (setTcgdexId) {
    const extSplit = externalId.indexOf("-");
    const suffix = extSplit > 0 ? externalId.slice(extSplit + 1).trim() : "";
    const canonicalSuffix = suffix || localId;
    if (canonicalSuffix) {
      ids.add(`${setTcgdexId}-${canonicalSuffix}`);
    }
  }

  if (externalId) {
    ids.add(externalId);
  }

  const expanded = new Set<string>();
  for (const id of ids) {
    for (const candidate of normalizePrefix(id)) {
      expanded.add(candidate);
    }
  }
  return Array.from(expanded);
}

function hasPricing(card: unknown): boolean {
  const { tcgplayer, cardmarket } = extractPricing(card);
  return tcgplayer !== null || cardmarket !== null;
}

/** First TCGdex card document found for any candidate id (may or may not have market pricing). */
async function resolveTcgdexCardFromCandidates(input: {
  externalId: string;
  localId?: string;
  setTcgdexId?: string;
}): Promise<{ lookupId: string; hasMarketPricing: boolean } | null> {
  const candidateIds = buildCandidateIds(input);
  for (const id of candidateIds) {
    try {
      const card = await tcgdex.fetch("cards", id);
      if (!card) continue;
      return { lookupId: id, hasMarketPricing: hasPricing(card) };
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function loadSetTcgdexIdMap(payload: PayloadClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const result = await payload.find({
    collection: "sets",
    limit: 5000,
    depth: 0,
    overrideAccess: true,
    select: {
      id: true,
      tcgdexId: true,
    },
  });

  for (const doc of result.docs as SetRow[]) {
    const id = String(doc.id);
    const tcgdexId = typeof doc.tcgdexId === "string" ? doc.tcgdexId.trim() : "";
    if (id && tcgdexId) {
      map.set(id, tcgdexId);
    }
  }

  return map;
}

async function populateMasterCardTcgdexIdFromPricing() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    const setTcgdexIdMap = await loadSetTcgdexIdMap(payload);
    const limit = 500;
    let page = 1;
    let totalPages = 1;

    let scanned = 0;
    let filled = 0;
    let cleared = 0;
    let unchanged = 0;
    let failures = 0;

    console.log("Starting tcgdex_id + no_pricing sync from TCGdex card lookups...");

    while (page <= totalPages) {
      const result = await payload.find({
        collection: "master-card-list",
        limit,
        page,
        depth: 0,
        overrideAccess: true,
        select: {
          id: true,
          set: true,
          localId: true,
          externalId: true,
          tcgdex_id: true,
          no_pricing: true,
        },
      });

      totalPages = result.totalPages || 1;

      for (const doc of result.docs) {
        scanned += 1;
        const row = doc as Record<string, unknown>;
        const id = String(row.id);
        const externalId =
          typeof row.externalId === "string" && row.externalId.trim() ? row.externalId.trim() : "";
        const localId =
          typeof row.localId === "string" && row.localId.trim() ? row.localId.trim() : undefined;
        const currentTcgdexId =
          typeof row.tcgdex_id === "string" && row.tcgdex_id.trim() ? row.tcgdex_id.trim() : "";
        const currentNoPricing =
          typeof row.no_pricing === "boolean" ? row.no_pricing : false;
        const setId = getRelationshipDocumentId(row.set);
        const setTcgdexId = setId ? setTcgdexIdMap.get(setId) : undefined;

        if (!externalId) {
          if (currentTcgdexId || currentNoPricing) {
            await payload.update({
              collection: "master-card-list",
              id,
              data: { tcgdex_id: "", no_pricing: false },
              overrideAccess: true,
            });
            cleared += 1;
          } else {
            unchanged += 1;
          }
          continue;
        }

        const resolved = await resolveTcgdexCardFromCandidates({
          externalId,
          localId,
          setTcgdexId,
        });

        if (resolved) {
          const targetNoPricing = !resolved.hasMarketPricing;
          const needsUpdate =
            currentTcgdexId !== resolved.lookupId || currentNoPricing !== targetNoPricing;
          if (needsUpdate) {
            await payload.update({
              collection: "master-card-list",
              id,
              data: {
                tcgdex_id: resolved.lookupId,
                no_pricing: targetNoPricing,
              },
              overrideAccess: true,
            });
            filled += 1;
          } else {
            unchanged += 1;
          }
        } else if (currentTcgdexId || currentNoPricing) {
          await payload.update({
            collection: "master-card-list",
            id,
            data: { tcgdex_id: "", no_pricing: false },
            overrideAccess: true,
          });
          cleared += 1;
          failures += 1;
        } else {
          failures += 1;
          unchanged += 1;
        }

        if (scanned % 100 === 0) {
          console.log(
            `Progress: ${scanned} scanned | ${filled} filled | ${cleared} cleared | ${failures} unresolved`,
          );
        }
      }

      console.log(
        `Page ${page}/${totalPages} complete | scanned=${scanned} filled=${filled} cleared=${cleared} unresolved=${failures}`,
      );
      page += 1;
    }

    console.log("");
    console.log("Done.");
    console.log(`Scanned: ${scanned}`);
    console.log(`Filled tcgdex_id: ${filled}`);
    console.log(`Cleared tcgdex_id: ${cleared}`);
    console.log(`Unresolved (no TCGdex card for candidates): ${failures}`);
    console.log(`Unchanged: ${unchanged}`);
  } finally {
    await payload.destroy();
  }
}

populateMasterCardTcgdexIdFromPricing().catch((error) => {
  console.error(error);
  process.exit(1);
});
