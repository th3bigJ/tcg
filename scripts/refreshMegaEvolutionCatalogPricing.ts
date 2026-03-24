import nextEnvImport from "@next/env";

import { MEGA_EVOLUTION_SERIES_NAME } from "../lib/catalogPricingConstants";
import { fetchLiveCardPricingGbpForCard } from "../lib/liveCardPricingGbp";
import { getRelationshipDocumentId, toPayloadRelationshipId } from "../lib/relationshipId";

type PayloadClient = Awaited<ReturnType<typeof import("payload").getPayload>>;

type RunTotals = {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

const MAX_FAILURE_LOGS = 50;

async function refreshMegaEvolutionCatalogPricing() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    const series = await findSeries(payload);
    if (!series) {
      console.error(`Series not found: ${MEGA_EVOLUTION_SERIES_NAME}`);
      process.exit(1);
    }

    const sets = await findSeriesSets(payload, series.id);
    if (sets.length === 0) {
      console.error(`No sets found for series: ${MEGA_EVOLUTION_SERIES_NAME}`);
      process.exit(1);
    }

    console.log(`Refreshing catalog pricing for series: ${MEGA_EVOLUTION_SERIES_NAME}`);
    console.log(`Sets to process (${sets.length}): ${sets.map((s) => s.code).join(", ")}`);
    console.log("");

    const totals: RunTotals = { scanned: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
    const failures: string[] = [];

    for (const set of sets) {
      const setTotals = await refreshSet(payload, set.id, set.code, set.name, set.tcgdexId, failures);
      totals.scanned += setTotals.scanned;
      totals.created += setTotals.created;
      totals.updated += setTotals.updated;
      totals.skipped += setTotals.skipped;
      totals.failed += setTotals.failed;
    }

    console.log("");
    console.log("Refresh complete.");
    console.log(`Series: ${MEGA_EVOLUTION_SERIES_NAME}`);
    console.log(`Sets: ${sets.map((s) => s.code).join(", ")}`);
    console.log(`Scanned: ${totals.scanned}`);
    console.log(`Created: ${totals.created}`);
    console.log(`Updated: ${totals.updated}`);
    console.log(`Skipped: ${totals.skipped}`);
    console.log(`Failed: ${totals.failed}`);

    if (failures.length > 0) {
      console.log("");
      console.log("Sample failures:");
      for (const failure of failures.slice(0, MAX_FAILURE_LOGS)) {
        console.log(`- ${failure}`);
      }
      if (failures.length > MAX_FAILURE_LOGS) {
        console.log(`...and ${failures.length - MAX_FAILURE_LOGS} more`);
      }
    }
  } finally {
    await payload.destroy();
  }
}

async function findSeries(payload: PayloadClient): Promise<{ id: string | number } | null> {
  const result = await payload.find({
    collection: "series",
    where: { name: { equals: MEGA_EVOLUTION_SERIES_NAME } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = result.docs[0];
  if (!doc) return null;
  const id = toPayloadRelationshipId(getRelationshipDocumentId(doc.id) ?? String(doc.id));
  if (id === undefined) return null;
  return { id };
}

async function findSeriesSets(
  payload: PayloadClient,
  seriesId: string | number,
): Promise<Array<{ id: string | number; code: string; name: string; tcgdexId?: string }>> {
  const result = await payload.find({
    collection: "sets",
    where: { serieName: { equals: seriesId } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });

  const rows: Array<{ id: string | number; code: string; name: string; tcgdexId?: string }> = [];

  for (const doc of result.docs) {
    const row = doc as Record<string, unknown>;
    const rawCode = typeof row.code === "string" ? row.code.trim() : "";
    const rawName = typeof row.name === "string" ? row.name.trim() : "";
    const rawTcgdexId = typeof row.tcgdexId === "string" ? row.tcgdexId.trim() : "";
    const id = toPayloadRelationshipId(getRelationshipDocumentId(row.id) ?? String(row.id));
    const canonicalCode = rawTcgdexId || rawCode;
    if (!canonicalCode || id === undefined) continue;
    rows.push({
      id,
      code: canonicalCode,
      name: rawName || canonicalCode,
      tcgdexId: rawTcgdexId || undefined,
    });
  }

  return rows.sort((a, b) => a.code.localeCompare(b.code));
}

async function refreshSet(
  payload: PayloadClient,
  setId: string | number,
  setCode: string,
  setName: string,
  setTcgdexId: string | undefined,
  failures: string[],
): Promise<RunTotals> {
  const cardsResult = await payload.find({
    collection: "master-card-list",
    where: { set: { equals: setId } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const totals: RunTotals = { scanned: cardsResult.docs.length, created: 0, updated: 0, skipped: 0, failed: 0 };

  console.log(`[${setCode}] ${setName}: ${cardsResult.docs.length} cards`);

  let index = 0;
  for (const doc of cardsResult.docs) {
    index += 1;
    const row = doc as Record<string, unknown>;
    const externalId =
      typeof row.externalId === "string" && row.externalId.trim() ? row.externalId.trim() : "";
    const localId = typeof row.localId === "string" && row.localId.trim() ? row.localId.trim() : undefined;
    const masterId = getRelationshipDocumentId(row.id) ?? (typeof row.id === "string" ? row.id : "");
    const masterRel = toPayloadRelationshipId(masterId);

    if (!externalId || masterRel === undefined) {
      totals.skipped += 1;
      if (index % 25 === 0 || index === cardsResult.docs.length) {
        console.log(`[${setCode}] progress ${index}/${cardsResult.docs.length}`);
      }
      continue;
    }

    const live = await fetchLiveCardPricingGbpForCard({
      externalId,
      setTcgdexId,
      localId,
    });
    const existing = await payload.find({
      collection: "catalog-card-pricing",
      where: { externalId: { equals: externalId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const existingDoc = existing.docs[0];

    if (!live) {
      totals.skipped += 1;
      totals.failed += 1;
      const existingPricing = existingDoc
        ? ((existingDoc as Record<string, unknown>).pricingGbp as
            | { tcgplayer?: unknown; cardmarket?: unknown }
            | undefined)
        : undefined;
      if (existingDoc && existingPricing?.tcgplayer == null && existingPricing?.cardmarket == null) {
        const existingId = getRelationshipDocumentId(existingDoc.id) ?? String(existingDoc.id);
        await payload.delete({
          collection: "catalog-card-pricing",
          id: existingId,
          overrideAccess: true,
        });
      }
      failures.push(`${setCode}:${externalId}: price fetch failed`);
      if (index % 25 === 0 || index === cardsResult.docs.length) {
        console.log(`[${setCode}] progress ${index}/${cardsResult.docs.length}`);
      }
      continue;
    }

    try {
      if (existingDoc) {
        const existingId = getRelationshipDocumentId(existingDoc.id) ?? String(existingDoc.id);
        await payload.update({
          collection: "catalog-card-pricing",
          id: existingId,
          data: {
            masterCard: masterRel,
            externalId,
            setCode,
            pricingGbp: live,
          },
          overrideAccess: true,
        });
        totals.updated += 1;
      } else {
        await payload.create({
          collection: "catalog-card-pricing",
          data: {
            masterCard: masterRel,
            externalId,
            setCode,
            pricingGbp: live,
          },
          overrideAccess: true,
        });
        totals.created += 1;
      }
    } catch (error) {
      totals.failed += 1;
      totals.skipped += 1;
      const message = error instanceof Error ? error.message : "write failed";
      failures.push(`${setCode}:${externalId}: ${message}`);
    }

    if (index % 25 === 0 || index === cardsResult.docs.length) {
      console.log(`[${setCode}] progress ${index}/${cardsResult.docs.length}`);
    }
  }

  console.log(
    `[${setCode}] done: created=${totals.created}, updated=${totals.updated}, skipped=${totals.skipped}, failed=${totals.failed}`,
  );
  console.log("");

  return totals;
}

refreshMegaEvolutionCatalogPricing().catch((error) => {
  console.error(error);
  process.exit(1);
});
