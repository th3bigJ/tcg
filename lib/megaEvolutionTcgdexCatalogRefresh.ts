import type { Payload } from "payload";

import { MEGA_EVOLUTION_SERIES_NAME } from "@/lib/catalogPricingConstants";
import {
  extractCardmarketAvgsGbp,
  extractTcgplayerMarketPricesGbp,
} from "@/lib/catalogPricingExtract";
import { catalogRowHasPricingData } from "@/lib/catalogPricingShape";
import { fetchRawTcgdexCardPricingForCard } from "@/lib/liveCardPricingGbp";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { chunkStrings, mapPool } from "@/lib/mapPool";
import {
  getRelationshipDocumentId,
  toPayloadDocumentId,
  toPayloadRelationshipId,
} from "@/lib/relationshipId";

function normalizeSetCodeKey(s: string): string {
  return s.trim().toLowerCase();
}

/** When set, only process Mega Evolution series sets whose code / tcgdexId matches one of these (case-insensitive). */
function shouldProcessSetForFilter(
  canonicalSetCode: string,
  legacyCode: string | undefined,
  setTcgdexId: string | undefined,
  onlySetCodes: readonly string[] | undefined,
): boolean {
  if (!onlySetCodes || onlySetCodes.length === 0) return true;
  const allowed = new Set(onlySetCodes.map(normalizeSetCodeKey));
  const candidates = [canonicalSetCode, legacyCode, setTcgdexId].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  return candidates.some((c) => allowed.has(normalizeSetCodeKey(c)));
}

const CATALOG_EXTERNAL_ID_IN_CHUNK = 200;

function tcgdexFetchConcurrency(): number {
  const raw = process.env.CATALOG_PRICING_TCGDEX_CONCURRENCY;
  const n = raw ? Number.parseInt(raw, 10) : 8;
  if (!Number.isFinite(n)) return 8;
  return Math.max(1, Math.min(32, n));
}

type TcgdexCardWork = {
  row: Record<string, unknown>;
  tcgdexIdField: string;
  extStored: string;
  ext: string;
  localId: string | undefined;
  masterRel: string | number;
  masterDocId: string | number;
  existingNoPricing: boolean;
};

async function loadCatalogPricingByExternalIds(
  payload: Payload,
  ids: readonly string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  const unique = [...new Set(ids.filter((s) => s.length > 0))];
  for (const batch of chunkStrings(unique, CATALOG_EXTERNAL_ID_IN_CHUNK)) {
    if (batch.length === 0) continue;
    const res = await payload.find({
      collection: "catalog-card-pricing",
      where: { externalId: { in: batch } },
      limit: batch.length + 20,
      depth: 0,
      overrideAccess: true,
    });
    for (const doc of res.docs) {
      const d = doc as Record<string, unknown>;
      const ex = d.externalId;
      if (typeof ex === "string" && !map.has(ex)) map.set(ex, d);
    }
  }
  return map;
}

export type MegaEvolutionTcgdexRefreshResult = {
  ok: true;
  seriesName: string;
  setCodes: string[];
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  /** Master rows where we set `no_pricing` to false (TCGdex returned market data and catalog write succeeded). */
  masterMarkedPricingOk: number;
  /** Master rows where we set `no_pricing` to true (lookup attempted but no TCGdex market data). */
  masterMarkedNoPricing: number;
  failedExternalIds: string[];
  moreFailures: boolean;
};

export type MegaEvolutionTcgdexRefreshOptions = {
  onProgress?: (line: string) => void;
  /** If non-empty, only refresh these set codes (e.g. `me02.5` for Ascended Heroes). */
  onlySetCodes?: readonly string[];
  /** Payload `series.name` (defaults to Mega Evolution). */
  seriesName?: string;
};

/** Merge stats from multiple `runMegaEvolutionTcgdexCatalogRefresh` runs (e.g. two series). */
export function mergeTcgdexCatalogRefreshResults(
  a: MegaEvolutionTcgdexRefreshResult,
  b: MegaEvolutionTcgdexRefreshResult,
): MegaEvolutionTcgdexRefreshResult {
  const combinedFailed = [...a.failedExternalIds, ...b.failedExternalIds];
  return {
    ok: true,
    seriesName: `${a.seriesName}; ${b.seriesName}`,
    setCodes: [...new Set([...a.setCodes, ...b.setCodes])],
    scanned: a.scanned + b.scanned,
    created: a.created + b.created,
    updated: a.updated + b.updated,
    skipped: a.skipped + b.skipped,
    masterMarkedPricingOk: a.masterMarkedPricingOk + b.masterMarkedPricingOk,
    masterMarkedNoPricing: a.masterMarkedNoPricing + b.masterMarkedNoPricing,
    failedExternalIds: combinedFailed.slice(0, 25),
    moreFailures: a.moreFailures || b.moreFailures || combinedFailed.length > 25,
  };
}

/**
 * For every master card in the given Payload series (default Mega Evolution): fetch TCGdex pricing,
 * upsert `catalog-card-pricing`, and set `master-card-list.no_pricing` to false on success or true when
 * the API returns no usable markets.
 */
export async function runMegaEvolutionTcgdexCatalogRefresh(
  payload: Payload,
  options: MegaEvolutionTcgdexRefreshOptions = {},
): Promise<MegaEvolutionTcgdexRefreshResult> {
  const { onProgress = () => {}, onlySetCodes, seriesName = MEGA_EVOLUTION_SERIES_NAME } = options;
  const concurrency = tcgdexFetchConcurrency();

  const seriesResult = await payload.find({
    collection: "series",
    where: { name: { equals: seriesName } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const seriesDoc = seriesResult.docs[0];
  if (!seriesDoc) {
    throw new Error(`Series not found: ${seriesName}`);
  }

  const seriesRelId = toPayloadRelationshipId(
    getRelationshipDocumentId(seriesDoc.id) ?? String(seriesDoc.id),
  );
  if (seriesRelId === undefined) {
    throw new Error("Invalid series id");
  }

  const setsResult = await payload.find({
    collection: "sets",
    where: { serieName: { equals: seriesRelId } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });
  if (setsResult.docs.length === 0) {
    throw new Error(`No sets found for series: ${seriesName}`);
  }

  const multipliers = await fetchGbpConversionMultipliers();
  onProgress(
    `[TCGdex] FX rates loaded (concurrency=${concurrency}; set CATALOG_PRICING_TCGDEX_CONCURRENCY to tune).`,
  );

  let updated = 0;
  let created = 0;
  let skipped = 0;
  let scanned = 0;
  let masterMarkedPricingOk = 0;
  let masterMarkedNoPricing = 0;
  const errors: string[] = [];
  const processedSetCodes: string[] = [];

  for (const setDoc of setsResult.docs) {
    const setRow = setDoc as Record<string, unknown>;
    const legacyCode =
      typeof setRow.code === "string" && setRow.code.trim() ? setRow.code.trim() : undefined;
    const setTcgdexId =
      typeof setRow.tcgdexId === "string" && setRow.tcgdexId.trim()
        ? setRow.tcgdexId.trim()
        : undefined;
    const canonicalSetCode = setTcgdexId ?? legacyCode;
    const setId = getRelationshipDocumentId(setRow.id) ?? String(setRow.id);
    const setRelId = toPayloadRelationshipId(setId);

    if (!canonicalSetCode || setRelId === undefined) {
      continue;
    }

    if (
      !shouldProcessSetForFilter(canonicalSetCode, legacyCode, setTcgdexId, onlySetCodes)
    ) {
      if (onlySetCodes?.length) {
        onProgress(`[TCGdex] skip set ${canonicalSetCode} (not in filter)`);
      }
      continue;
    }

    processedSetCodes.push(canonicalSetCode);
    const cardsResult = await payload.find({
      collection: "master-card-list",
      where: { set: { equals: setRelId } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    scanned += cardsResult.docs.length;

    const workItems: TcgdexCardWork[] = [];
    for (const doc of cardsResult.docs) {
      const row = doc as Record<string, unknown>;
      const tcgdexIdField =
        typeof row.tcgdex_id === "string" && row.tcgdex_id.trim() ? row.tcgdex_id.trim() : "";
      const extStored =
        typeof row.externalId === "string" && row.externalId.trim() ? row.externalId.trim() : "";
      const ext = tcgdexIdField || extStored;
      const localId =
        typeof row.localId === "string" && row.localId.trim() ? row.localId.trim() : undefined;
      const masterId = getRelationshipDocumentId(row.id) ?? (typeof row.id === "string" ? row.id : "");
      const masterRel = toPayloadRelationshipId(masterId);
      const masterDocId = toPayloadDocumentId(row.id);
      const existingNoPricing = row.no_pricing === true;

      if (!ext || masterRel === undefined) {
        skipped += 1;
        continue;
      }

      workItems.push({
        row,
        tcgdexIdField,
        extStored,
        ext,
        localId,
        masterRel,
        masterDocId,
        existingNoPricing,
      });
    }

    const catalogIdList: string[] = [];
    for (const w of workItems) {
      catalogIdList.push(w.ext);
      if (w.extStored && w.extStored !== w.ext) catalogIdList.push(w.extStored);
    }
    const catalogByExt = await loadCatalogPricingByExternalIds(payload, catalogIdList);

    onProgress(
      `[TCGdex · ${canonicalSetCode}] ${workItems.length} card(s) with ids — fetching (${concurrency} parallel)…`,
    );

    const pricingOptions = { multipliers } as const;
    const priced = await mapPool(workItems, concurrency, async (w) => {
      let raw = await fetchRawTcgdexCardPricingForCard(
        {
          externalId: w.ext,
          setTcgdexId,
          localId: w.localId,
        },
        pricingOptions,
      );
      if (!raw && w.extStored && w.extStored !== w.ext) {
        raw = await fetchRawTcgdexCardPricingForCard(
          {
            externalId: w.extStored,
            setTcgdexId,
            localId: w.localId,
          },
          pricingOptions,
        );
      }
      return { w, raw };
    });

    let applyIndex = 0;
    for (const { w, raw } of priced) {
      applyIndex += 1;
      const existingDoc =
        catalogByExt.get(w.ext) ??
        (w.extStored !== w.ext ? catalogByExt.get(w.extStored) : undefined);

      const tcgplayerPrice = raw
        ? extractTcgplayerMarketPricesGbp(raw.tcgplayer, multipliers)
        : null;
      const cardmarketPrice = raw
        ? extractCardmarketAvgsGbp(raw.cardmarket, multipliers)
        : null;
      const hasAny =
        (tcgplayerPrice !== null && Object.keys(tcgplayerPrice).length > 0) ||
        (cardmarketPrice !== null && Object.keys(cardmarketPrice).length > 0);

      if (!hasAny) {
        if (existingDoc && !catalogRowHasPricingData(existingDoc)) {
          const existingId = getRelationshipDocumentId(existingDoc.id) ?? String(existingDoc.id);
          await payload.delete({
            collection: "catalog-card-pricing",
            id: existingId,
            overrideAccess: true,
          });
          catalogByExt.delete(w.ext);
          if (w.extStored && w.extStored !== w.ext) catalogByExt.delete(w.extStored);
        }
        errors.push(w.ext);
        skipped += 1;
        if (!w.existingNoPricing) {
          await payload.update({
            collection: "master-card-list",
            id: w.masterDocId,
            data: { no_pricing: true },
            overrideAccess: true,
          });
          masterMarkedNoPricing += 1;
        }
        if (applyIndex === 1 || applyIndex === priced.length || applyIndex % 25 === 0) {
          onProgress(`[TCGdex · ${canonicalSetCode}] DB apply ${applyIndex}/${priced.length}…`);
        }
        continue;
      }

      const catalogTcgdexId = w.tcgdexIdField || undefined;
      const externalPricing =
        raw !== null
          ? { tcgplayer: raw.tcgplayer, cardmarket: raw.cardmarket }
          : undefined;

      try {
        if (existingDoc) {
          const eid = getRelationshipDocumentId(existingDoc.id) ?? String(existingDoc.id);
          await payload.update({
            collection: "catalog-card-pricing",
            id: eid,
            data: {
              masterCard: w.masterRel,
              externalId: w.ext,
              setCode: canonicalSetCode,
              ...(catalogTcgdexId !== undefined ? { tcgdex_id: catalogTcgdexId } : {}),
              ...(externalPricing !== undefined ? { externalPricing } : {}),
              externalPrice: null,
            },
            overrideAccess: true,
          });
          updated += 1;
        } else {
          const createdDoc = await payload.create({
            collection: "catalog-card-pricing",
            data: {
              masterCard: w.masterRel,
              externalId: w.ext,
              setCode: canonicalSetCode,
              ...(catalogTcgdexId !== undefined ? { tcgdex_id: catalogTcgdexId } : {}),
              ...(externalPricing !== undefined ? { externalPricing } : {}),
              externalPrice: null,
            },
            overrideAccess: true,
          });
          const cd = createdDoc as Record<string, unknown>;
          const ex = cd.externalId;
          if (typeof ex === "string") catalogByExt.set(ex, cd);
          created += 1;
        }

        if (w.existingNoPricing) {
          await payload.update({
            collection: "master-card-list",
            id: w.masterDocId,
            data: { no_pricing: false },
            overrideAccess: true,
          });
          masterMarkedPricingOk += 1;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "write failed";
        errors.push(`${w.ext}: ${msg}`);
      }

      if (applyIndex === 1 || applyIndex === priced.length || applyIndex % 25 === 0) {
        onProgress(`[TCGdex · ${canonicalSetCode}] DB apply ${applyIndex}/${priced.length}…`);
      }
    }

    onProgress(`[TCGdex · ${canonicalSetCode}] set complete.`);
  }

  if (onlySetCodes?.length && processedSetCodes.length === 0) {
    throw new Error(
      `No set matched onlySetCodes: ${onlySetCodes.join(", ")} (check Payload set code / tcgdexId).`,
    );
  }

  return {
    ok: true,
    seriesName,
    setCodes: processedSetCodes,
    scanned,
    created,
    updated,
    skipped,
    masterMarkedPricingOk,
    masterMarkedNoPricing,
    failedExternalIds: errors.slice(0, 25),
    moreFailures: errors.length > 25,
  };
}
