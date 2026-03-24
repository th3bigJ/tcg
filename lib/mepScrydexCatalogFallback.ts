import type { Payload } from "payload";

import {
  collateFlatExternalScrapeUsdToByVariant,
  convertExternalScrapeByVariantUsdToGbp,
} from "@/lib/catalogPricingExtract";
import { catalogRowHasTcgdexOrCardmarket } from "@/lib/catalogPricingShape";
import { mapPool } from "@/lib/mapPool";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import {
  fetchScrydexCardPageHtml,
  mergeScrydexExpansionAndDetailUsd,
  parseScrydexCardPagePsa10Usd,
  parseScrydexCardPageRawNearMintUsd,
} from "@/lib/scrydexMepCardPagePricing";
import {
  fetchScrydexMepExpansionHtml,
  normalizeMepExternalId,
  parseScrydexMepExpansionCardPaths,
  parseScrydexMepExpansionPrices,
  SCRYDEX_MEP_EXPANSION_URL,
} from "@/lib/scrydexMepExpansionPricing";
import { getRelationshipDocumentId, toPayloadRelationshipId } from "@/lib/relationshipId";

export type MepScrydexFallbackResult = {
  mepMasterRows: number;
  created: number;
  updated: number;
  dryRunWouldCreate: number;
  dryRunWouldUpdate: number;
  skippedNotNoPricing: number;
  skippedNoScrydexId: number;
  skippedScrydexNa: number;
  skippedCatalogTcgdexOk: number;
  errors: string[];
};

export type MepScrydexFallbackOptions = {
  /** If true (default), only process master cards with `no_pricing === true` after TCGdex. */
  onlyMasterNoPricing: boolean;
  force?: boolean;
  dryRun?: boolean;
  /** Optional log line for progress (e.g. console.log). */
  onProgress?: (line: string) => void;
};

async function findMepSet(
  payload: Payload,
): Promise<{ id: string | number; code: string } | null> {
  const byCode = await payload.find({
    collection: "sets",
    where: { code: { equals: "mep" } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const byTcgdex = await payload.find({
    collection: "sets",
    where: { tcgdexId: { equals: "mep" } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = (byCode.docs[0] ?? byTcgdex.docs[0]) as Record<string, unknown> | undefined;
  if (!doc) return null;
  const id = toPayloadRelationshipId(getRelationshipDocumentId(doc.id) ?? String(doc.id));
  const code =
    typeof doc.tcgdexId === "string" && doc.tcgdexId.trim()
      ? doc.tcgdexId.trim()
      : typeof doc.code === "string" && doc.code.trim()
        ? doc.code.trim()
        : "mep";
  if (id === undefined) return null;
  return { id, code };
}

function scrydexCardPageConcurrency(): number {
  const raw = process.env.SCRYDEX_CARD_PAGE_CONCURRENCY;
  const n = raw ? Number.parseInt(raw, 10) : 4;
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(12, n));
}

type MepCandidate = {
  norm: string;
  catalogExternalId: string;
  extStored: string;
  tcgdexIdField: string;
  masterRel: string | number;
};

function resolveListUsd(
  priceMap: Map<string, Record<string, number>>,
  norm: string,
  catalogExternalId: string,
  extStored: string,
): Record<string, number> {
  let rec = priceMap.get(norm);
  if (!rec || Object.keys(rec).length === 0) {
    const alt = normalizeMepExternalId(catalogExternalId);
    if (alt) rec = priceMap.get(alt);
  }
  if (!rec || Object.keys(rec).length === 0) {
    const alt2 = extStored ? normalizeMepExternalId(extStored) : null;
    if (alt2) rec = priceMap.get(alt2);
  }
  return rec && Object.keys(rec).length > 0 ? { ...rec } : {};
}

function resolveCardPath(
  pathMap: Map<string, string>,
  norm: string,
  catalogExternalId: string,
  extStored: string,
): string | undefined {
  const tryKeys = [norm, normalizeMepExternalId(catalogExternalId) ?? "", extStored ? normalizeMepExternalId(extStored) ?? "" : ""].filter(
    Boolean,
  );
  for (const k of tryKeys) {
    const p = pathMap.get(k);
    if (p) return p;
  }
  return undefined;
}

/**
 * Scrape Scrydex MEP expansion + card detail pages (Chartkick Raw NM series) into `external_price` (GBP).
 */
export async function runMepScrydexCatalogFallback(
  payload: Payload,
  options: MepScrydexFallbackOptions,
): Promise<MepScrydexFallbackResult> {
  const {
    onlyMasterNoPricing,
    force = false,
    dryRun = false,
    onProgress = () => {},
  } = options;

  onProgress("Fetching Scrydex MEP expansion HTML…");
  const html = await fetchScrydexMepExpansionHtml();
  const priceMap = parseScrydexMepExpansionPrices(html);
  const pathMap = parseScrydexMepExpansionCardPaths(html);
  onProgress(
    `Scrydex: expansion list ${priceMap.size} card id(s); ${pathMap.size} card detail path(s).`,
  );

  const mepSet = await findMepSet(payload);
  if (!mepSet) {
    throw new Error('Set not found: use code or tcgdexId "mep"');
  }

  const cardsResult = await payload.find({
    collection: "master-card-list",
    where: { set: { equals: mepSet.id } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  onProgress(`MEP master cards: ${cardsResult.docs.length} row(s).`);

  const multipliers = await fetchGbpConversionMultipliers();

  const candidates: MepCandidate[] = [];
  let skippedNotNoPricing = 0;
  let skippedNoScrydexId = 0;
  for (const doc of cardsResult.docs) {
    const row = doc as Record<string, unknown>;
    if (onlyMasterNoPricing && row.no_pricing !== true) {
      skippedNotNoPricing += 1;
      continue;
    }

    const tcgdexIdField =
      typeof row.tcgdex_id === "string" && row.tcgdex_id.trim() ? row.tcgdex_id.trim() : "";
    const extStored =
      typeof row.externalId === "string" && row.externalId.trim() ? row.externalId.trim() : "";
    const extPrimary = tcgdexIdField || extStored;
    const norm = normalizeMepExternalId(extPrimary) ?? normalizeMepExternalId(extStored);
    const masterRel = toPayloadRelationshipId(
      getRelationshipDocumentId(row.id) ?? (typeof row.id === "string" ? row.id : ""),
    );

    if (!norm || masterRel === undefined) {
      skippedNoScrydexId += 1;
      continue;
    }

    const catalogExternalId = /^mep-\d+$/i.test(extPrimary.trim())
      ? extPrimary.trim().toLowerCase()
      : norm;

    candidates.push({
      norm,
      catalogExternalId,
      extStored,
      tcgdexIdField,
      masterRel,
    });
  }

  const pathsNeeded = new Set<string>();
  for (const c of candidates) {
    const p = resolveCardPath(pathMap, c.norm, c.catalogExternalId, c.extStored);
    if (p) pathsNeeded.add(p);
  }

  const conc = scrydexCardPageConcurrency();
  onProgress(`Scrydex: fetching ${pathsNeeded.size} card page(s) (concurrency=${conc}) for Raw Near Mint…`);
  const pathHtml = new Map<string, string>();
  await mapPool([...pathsNeeded], conc, async (path) => {
    try {
      const page = await fetchScrydexCardPageHtml(path);
      pathHtml.set(path, page);
    } catch {
      pathHtml.set(path, "");
    }
  });

  let skippedScrydexNa = 0;
  let skippedCatalogTcgdexOk = 0;
  let created = 0;
  let updated = 0;
  let dryRunWouldCreate = 0;
  let dryRunWouldUpdate = 0;
  const errors: string[] = [];

  let i = 0;
  for (const c of candidates) {
    i += 1;
    const listUsd = resolveListUsd(priceMap, c.norm, c.catalogExternalId, c.extStored);
    const path = resolveCardPath(pathMap, c.norm, c.catalogExternalId, c.extStored);
    const pageHtml = path ? pathHtml.get(path) ?? "" : "";
    const detailUsd = pageHtml.length > 0 ? parseScrydexCardPageRawNearMintUsd(pageHtml) : {};
    const psa10Usd = pageHtml.length > 0 ? parseScrydexCardPagePsa10Usd(pageHtml) : {};
    const variantsUsdFlat = {
      ...mergeScrydexExpansionAndDetailUsd(listUsd, detailUsd),
      ...psa10Usd,
    };
    const variantsUsd = collateFlatExternalScrapeUsdToByVariant(variantsUsdFlat);

    if (Object.keys(variantsUsd).length === 0) {
      skippedNoScrydexId += 1;
      continue;
    }

    const hasAnyUsd = Object.values(variantsUsd).some(
      (rec) =>
        (typeof rec.raw === "number" && Number.isFinite(rec.raw)) ||
        (typeof rec.psa10 === "number" && Number.isFinite(rec.psa10)),
    );
    if (!hasAnyUsd) {
      skippedScrydexNa += 1;
      continue;
    }

    const existingByCatalogId = await payload.find({
      collection: "catalog-card-pricing",
      where: { externalId: { equals: c.catalogExternalId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const existingByNorm =
      c.catalogExternalId !== c.norm
        ? await payload.find({
            collection: "catalog-card-pricing",
            where: { externalId: { equals: c.norm } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
        : null;
    const existingByStored =
      c.extStored && c.extStored !== c.catalogExternalId && c.extStored !== c.norm
        ? await payload.find({
            collection: "catalog-card-pricing",
            where: { externalId: { equals: c.extStored } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
        : null;

    const existingDoc =
      existingByCatalogId.docs[0] ?? existingByNorm?.docs[0] ?? existingByStored?.docs[0];

    if (existingDoc && !force && catalogRowHasTcgdexOrCardmarket(existingDoc)) {
      skippedCatalogTcgdexOk += 1;
      continue;
    }

    const externalPrice = convertExternalScrapeByVariantUsdToGbp(variantsUsd, multipliers);

    const externalPricing = {
      source: "scrydex" as const,
      expansionUrl: SCRYDEX_MEP_EXPANSION_URL,
      cardPath: path ?? null,
      detailParsed:
        Object.keys(detailUsd).length > 0 || Object.keys(psa10Usd).length > 0,
      variantsUsd,
      fetchedAt: new Date().toISOString(),
    };

    const catalogTcgdexId = c.tcgdexIdField || undefined;

    if (i === 1 || i === candidates.length || i % 10 === 0) {
      onProgress(`Scrydex apply: ${i}/${candidates.length}…`);
    }

    if (dryRun) {
      if (existingDoc) dryRunWouldUpdate += 1;
      else dryRunWouldCreate += 1;
      onProgress(
        `[dry-run] ${c.catalogExternalId} → ${Object.entries(externalPrice)
          .map(([vk, r]) => {
            const bits: string[] = [];
            if (typeof r.raw === "number") bits.push(`raw=${r.raw}`);
            if (typeof r.psa10 === "number") bits.push(`psa10=${r.psa10}`);
            return `${vk}(${bits.join(",")})`;
          })
          .join(" ")} (${existingDoc ? "update" : "create"})`,
      );
      continue;
    }

    try {
      if (existingDoc) {
        const eid = getRelationshipDocumentId(existingDoc.id) ?? String(existingDoc.id);
        await payload.update({
          collection: "catalog-card-pricing",
          id: eid,
          data: {
            masterCard: c.masterRel,
            externalId: c.catalogExternalId,
            setCode: mepSet.code,
            ...(catalogTcgdexId !== undefined ? { tcgdex_id: catalogTcgdexId } : {}),
            externalPricing,
            externalPrice,
          },
          overrideAccess: true,
        });
        updated += 1;
      } else {
        await payload.create({
          collection: "catalog-card-pricing",
          data: {
            masterCard: c.masterRel,
            externalId: c.catalogExternalId,
            setCode: mepSet.code,
            ...(catalogTcgdexId !== undefined ? { tcgdex_id: catalogTcgdexId } : {}),
            externalPricing,
            externalPrice,
          },
          overrideAccess: true,
        });
        created += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "write failed";
      errors.push(`${c.catalogExternalId}: ${msg}`);
    }
  }

  return {
    mepMasterRows: cardsResult.docs.length,
    created,
    updated,
    dryRunWouldCreate,
    dryRunWouldUpdate,
    skippedNotNoPricing,
    skippedNoScrydexId,
    skippedScrydexNa,
    skippedCatalogTcgdexOk,
    errors,
  };
}
