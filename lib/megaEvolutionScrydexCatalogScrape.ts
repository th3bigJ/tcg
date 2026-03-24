import type { Payload } from "payload";

import { resolveScrydexExpansionBySetIdentifiers } from "@/lib/scrydexCatalogExpansionResolve";
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
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPaths,
  parseScrydexExpansionListPrices,
  resolveScrydexCardPath,
  resolveScrydexListUsd,
} from "@/lib/scrydexExpansionListParsing";
import { getRelationshipDocumentId, toPayloadDocumentId, toPayloadRelationshipId } from "@/lib/relationshipId";

export type MegaEvolutionScrydexScrapeResult = {
  /** Series that were scraped successfully (Payload `series.name`). */
  seriesNames: string[];
  seriesWarnings?: string[];
  setCodes: string[];
  masterRows: number;
  skippedNoScrydexExpansion: number;
  skippedNoPrice: number;
  skippedHasTcgdexCatalog: number;
  masterMarkedPricingOk: number;
  masterMarkedNoPricing: number;
  created: number;
  updated: number;
  errors: string[];
};

export type MegaEvolutionScrydexScrapeOptions = {
  onProgress?: (line: string) => void;
  dryRun?: boolean;
  /**
   * When false, skip rows that already have TCGdex `tcgplayer` / `cardmarket` in `externalPricing`.
   * When true (default), still refresh `externalPrice` / `externalPricing`.
   */
  patchExternalEvenIfTcgdex?: boolean;
  /** If non-empty, only these set codes / tcgdex ids (case-insensitive). */
  onlySetCodes?: readonly string[];
  /**
   * If set, only sets under these Payload series names are scraped.
   * If omitted or empty, **every** `sets` row is considered (any series) — still only cards with a known Scrydex URL map.
   */
  seriesNames?: readonly string[];
  /** Max `sets` documents in all-series mode (default 2000). */
  setsLimit?: number;
};

function normalizeSetCodeKey(s: string): string {
  return s.trim().toLowerCase();
}

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

type ScrydexWorkItem = {
  setCode: string;
  expansionUrl: string;
  listPrefix: string;
  tcgPrefixes: string[];
  masterRel: string | number;
  masterDocId: string | number;
  catalogExternalId: string;
  extStored: string;
  tcgdexIdField: string;
};

function scrydexCardPageConcurrency(): number {
  const raw = process.env.SCRYDEX_CARD_PAGE_CONCURRENCY;
  const n = raw ? Number.parseInt(raw, 10) : 4;
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(12, n));
}

type ParsedExpansion = {
  listPrefix: string;
  expansionUrl: string;
  priceMap: Map<string, Record<string, number>>;
  pathMap: Map<string, string>;
};

function shouldUpdateMasterForScrydexRow(
  existingDoc: unknown,
  patchExternalEvenIfTcgdex: boolean,
): boolean {
  if (patchExternalEvenIfTcgdex) return true;
  if (!existingDoc) return true;
  return !catalogRowHasTcgdexOrCardmarket(existingDoc);
}

/**
 * Scrape Scrydex expansion lists + card pages for every set that maps to a known expansion URL
 * (Mega Evolution, Scarlet & Violet, SWSH, SM, XY, … — see `scrydexBulkExpansionUrls` and related modules).
 * Writes **externalPrice** (GBP) and **externalPricing**; clears TCGdex columns on each write.
 */
export async function runMegaEvolutionScrydexCatalogScrape(
  payload: Payload,
  options: MegaEvolutionScrydexScrapeOptions = {},
): Promise<MegaEvolutionScrydexScrapeResult> {
  const {
    onProgress = () => {},
    dryRun = false,
    patchExternalEvenIfTcgdex = true,
    onlySetCodes,
    seriesNames,
    setsLimit = 2000,
  } = options;

  const multipliers = await fetchGbpConversionMultipliers();
  const work: ScrydexWorkItem[] = [];
  let skippedNoScrydexExpansion = 0;
  const processedSetCodes: string[] = [];
  const seriesApplied: string[] = [];
  const seriesWarnings: string[] = [];

  const processOneSet = async (
    setRow: Record<string, unknown>,
    seriesLabel: string,
  ): Promise<void> => {
    const legacyCode =
      typeof setRow.code === "string" && setRow.code.trim() ? setRow.code.trim() : undefined;
    const setTcgdexId =
      typeof setRow.tcgdexId === "string" && setRow.tcgdexId.trim()
        ? setRow.tcgdexId.trim()
        : undefined;
    const canonicalSetCode = setTcgdexId ?? legacyCode;
    const setId = getRelationshipDocumentId(setRow.id) ?? String(setRow.id);
    const setRelId = toPayloadRelationshipId(setId);

    if (!canonicalSetCode || setRelId === undefined) return;

    if (!shouldProcessSetForFilter(canonicalSetCode, legacyCode, setTcgdexId, onlySetCodes)) {
      return;
    }

    const scrydexCfg = resolveScrydexExpansionBySetIdentifiers(
      canonicalSetCode,
      legacyCode,
      setTcgdexId,
    );
    const cardsResult = await payload.find({
      collection: "master-card-list",
      where: { set: { equals: setRelId } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });

    if (!scrydexCfg) {
      skippedNoScrydexExpansion += cardsResult.docs.length;
      onProgress(
        `[Scrydex · ${seriesLabel}] skip set ${canonicalSetCode} (no Scrydex expansion URL in registry)`,
      );
      return;
    }

    processedSetCodes.push(canonicalSetCode);
    const tcgPrefixes = [canonicalSetCode, legacyCode, setTcgdexId].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );

    for (const doc of cardsResult.docs) {
      const row = doc as Record<string, unknown>;
      const tcgdexIdField =
        typeof row.tcgdex_id === "string" && row.tcgdex_id.trim() ? row.tcgdex_id.trim() : "";
      const extStored =
        typeof row.externalId === "string" && row.externalId.trim() ? row.externalId.trim() : "";
      const ext = (tcgdexIdField || extStored).trim().toLowerCase();
      const masterId = getRelationshipDocumentId(row.id) ?? (typeof row.id === "string" ? row.id : "");
      const masterRel = toPayloadRelationshipId(masterId);
      const masterDocId = toPayloadDocumentId(row.id);
      if (!ext || masterRel === undefined) {
        continue;
      }

      work.push({
        setCode: canonicalSetCode,
        expansionUrl: scrydexCfg.expansionUrl,
        listPrefix: scrydexCfg.listPrefix,
        tcgPrefixes,
        masterRel,
        masterDocId,
        catalogExternalId: ext,
        extStored,
        tcgdexIdField,
      });
    }
  };

  const allSeriesMode = !seriesNames || seriesNames.length === 0;

  if (allSeriesMode) {
    const setsResult = await payload.find({
      collection: "sets",
      limit: setsLimit,
      depth: 0,
      overrideAccess: true,
      sort: "name",
    });
    if (setsResult.docs.length === 0) {
      throw new Error("No sets found in database.");
    }
    seriesApplied.push("All sets (all series)");
    onProgress(`[Scrydex] all-series mode: ${setsResult.docs.length} set document(s), limit=${setsLimit}…`);
    for (const setDoc of setsResult.docs) {
      await processOneSet(setDoc as Record<string, unknown>, "all series");
    }
    if (work.length === 0) {
      seriesWarnings.push(
        "No master cards were queued. Either no sets matched a Scrydex URL, or master rows lack external/tcgdex ids — extend lib/scrydexBulkExpansionUrls.ts (or SV/ME maps) for missing tcgdx set codes.",
      );
    }
  } else {
    for (const seriesName of seriesNames) {
      const seriesResult = await payload.find({
        collection: "series",
        where: { name: { equals: seriesName } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      const seriesDoc = seriesResult.docs[0];
      if (!seriesDoc) {
        seriesWarnings.push(`Series not found: ${seriesName}`);
        onProgress(`[Scrydex] skip series ${seriesName} (not in Payload)`);
        continue;
      }
      const seriesRelId = toPayloadRelationshipId(
        getRelationshipDocumentId(seriesDoc.id) ?? String(seriesDoc.id),
      );
      if (seriesRelId === undefined) {
        seriesWarnings.push(`Invalid series id: ${seriesName}`);
        continue;
      }

      const setsResult = await payload.find({
        collection: "sets",
        where: { serieName: { equals: seriesRelId } },
        limit: 200,
        depth: 0,
        overrideAccess: true,
      });
      if (setsResult.docs.length === 0) {
        seriesWarnings.push(`No sets for series: ${seriesName}`);
        onProgress(`[Scrydex] skip series ${seriesName} (no sets)`);
        continue;
      }

      seriesApplied.push(seriesName);
      onProgress(`[Scrydex] series ${seriesName}: ${setsResult.docs.length} set(s)…`);

      for (const setDoc of setsResult.docs) {
        await processOneSet(setDoc as Record<string, unknown>, seriesName);
      }
    }

    if (seriesApplied.length === 0) {
      throw new Error(
        seriesWarnings.length > 0
          ? seriesWarnings.join(" | ")
          : "No series to scrape (check Payload series names).",
      );
    }
  }

  const uniqueExpansionUrls = [...new Set(work.map((w) => w.expansionUrl))];
  onProgress(`[Scrydex] fetching ${uniqueExpansionUrls.length} expansion listing(s) (all pages)…`);
  const parsedByUrl = new Map<string, ParsedExpansion>();
  for (const url of uniqueExpansionUrls) {
    try {
      const html = await fetchScrydexExpansionMultiPageHtml(url);
      const item = work.find((w) => w.expansionUrl === url);
      const listPrefix = item?.listPrefix ?? "mep";
      parsedByUrl.set(url, {
        expansionUrl: url,
        listPrefix,
        priceMap: parseScrydexExpansionListPrices(html, listPrefix),
        pathMap: parseScrydexExpansionListPaths(html, listPrefix),
      });
      onProgress(
        `[Scrydex] ${url.split("/").pop()}: ${parsedByUrl.get(url)!.priceMap.size} list tile(s)`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      onProgress(`[Scrydex] expansion failed ${url}: ${msg}`);
    }
  }

  const pathsNeeded = new Set<string>();
  for (const w of work) {
    const parsed = parsedByUrl.get(w.expansionUrl);
    if (!parsed) continue;
    const path = resolveScrydexCardPath(
      parsed.pathMap,
      w.catalogExternalId,
      w.listPrefix,
      w.tcgPrefixes,
    );
    if (path) pathsNeeded.add(path);
  }

  const conc = scrydexCardPageConcurrency();
  onProgress(
    `[Scrydex] fetching ${pathsNeeded.size} card detail page(s) (concurrency=${conc})…`,
  );
  const pathHtml = new Map<string, string>();
  await mapPool([...pathsNeeded], conc, async (path) => {
    try {
      pathHtml.set(path, await fetchScrydexCardPageHtml(path));
    } catch {
      pathHtml.set(path, "");
    }
  });

  let skippedNoPrice = 0;
  let skippedHasTcgdexCatalog = 0;
  let masterMarkedPricingOk = 0;
  let masterMarkedNoPricing = 0;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  let i = 0;
  for (const w of work) {
    i += 1;
    const parsed = parsedByUrl.get(w.expansionUrl);
    if (!parsed) {
      skippedNoPrice += 1;
      continue;
    }

    const listUsd = resolveScrydexListUsd(
      parsed.priceMap,
      w.catalogExternalId,
      w.listPrefix,
      w.tcgPrefixes,
    );
    const path = resolveScrydexCardPath(
      parsed.pathMap,
      w.catalogExternalId,
      w.listPrefix,
      w.tcgPrefixes,
    );
    const pageHtml = path ? pathHtml.get(path) ?? "" : "";
    const detailUsd = pageHtml.length > 0 ? parseScrydexCardPageRawNearMintUsd(pageHtml) : {};
    const psa10Usd = pageHtml.length > 0 ? parseScrydexCardPagePsa10Usd(pageHtml) : {};
    const variantsUsdFlat = {
      ...mergeScrydexExpansionAndDetailUsd(listUsd, detailUsd),
      ...psa10Usd,
    };
    const variantsUsd = collateFlatExternalScrapeUsdToByVariant(variantsUsdFlat);

    const hasAnyUsd = Object.values(variantsUsd).some(
      (rec) =>
        (typeof rec.raw === "number" && Number.isFinite(rec.raw)) ||
        (typeof rec.psa10 === "number" && Number.isFinite(rec.psa10)),
    );

    const existingByCatalogId = await payload.find({
      collection: "catalog-card-pricing",
      where: { externalId: { equals: w.catalogExternalId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const storedLower = w.extStored.trim().toLowerCase();
    const existingByStored =
      storedLower &&
      storedLower !== w.catalogExternalId
        ? await payload.find({
            collection: "catalog-card-pricing",
            where: { externalId: { equals: storedLower } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
        : null;

    const existingDoc = existingByCatalogId.docs[0] ?? existingByStored?.docs[0];

    if (
      existingDoc &&
      !patchExternalEvenIfTcgdex &&
      catalogRowHasTcgdexOrCardmarket(existingDoc)
    ) {
      skippedHasTcgdexCatalog += 1;
      continue;
    }

    if (!hasAnyUsd) {
      skippedNoPrice += 1;
      if (
        !dryRun &&
        shouldUpdateMasterForScrydexRow(existingDoc, patchExternalEvenIfTcgdex)
      ) {
        try {
          await payload.update({
            collection: "master-card-list",
            id: w.masterDocId,
            data: { no_pricing: true },
            overrideAccess: true,
          });
          masterMarkedNoPricing += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "master update failed";
          errors.push(`${w.catalogExternalId} master: ${msg}`);
        }
      }
      continue;
    }

    const externalPrice = convertExternalScrapeByVariantUsdToGbp(variantsUsd, multipliers);
    const catalogTcgdexId = w.tcgdexIdField || undefined;

    const externalPricing = {
      source: "scrydex" as const,
      expansionUrl: w.expansionUrl,
      cardPath: path ?? null,
      detailParsed:
        Object.keys(detailUsd).length > 0 || Object.keys(psa10Usd).length > 0,
      variantsUsd,
      fetchedAt: new Date().toISOString(),
    };

    if (i === 1 || i === work.length || i % 50 === 0) {
      onProgress(`[Scrydex] apply ${i}/${work.length}…`);
    }

    if (dryRun) {
      continue;
    }

    try {
      if (existingDoc) {
        const eid = getRelationshipDocumentId(existingDoc.id) ?? String(existingDoc.id);
        await payload.update({
          collection: "catalog-card-pricing",
          id: eid,
          data: {
            masterCard: w.masterRel,
            externalId: w.catalogExternalId,
            setCode: w.setCode,
            ...(catalogTcgdexId !== undefined ? { tcgdex_id: catalogTcgdexId } : {}),
            tcgplayerPrice: null,
            cardmarketPrice: null,
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
            masterCard: w.masterRel,
            externalId: w.catalogExternalId,
            setCode: w.setCode,
            ...(catalogTcgdexId !== undefined ? { tcgdex_id: catalogTcgdexId } : {}),
            tcgplayerPrice: null,
            cardmarketPrice: null,
            externalPricing,
            externalPrice,
          },
          overrideAccess: true,
        });
        created += 1;
      }

      try {
        await payload.update({
          collection: "master-card-list",
          id: w.masterDocId,
          data: { no_pricing: false },
          overrideAccess: true,
        });
        masterMarkedPricingOk += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "master update failed";
        errors.push(`${w.catalogExternalId} master: ${msg}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "write failed";
      errors.push(`${w.catalogExternalId}: ${msg}`);
    }
  }

  return {
    seriesNames: seriesApplied,
    ...(seriesWarnings.length > 0 ? { seriesWarnings } : {}),
    setCodes: [...new Set(processedSetCodes)],
    masterRows: work.length,
    skippedNoScrydexExpansion,
    skippedNoPrice,
    skippedHasTcgdexCatalog,
    masterMarkedPricingOk,
    masterMarkedNoPricing,
    created,
    updated,
    errors,
  };
}
