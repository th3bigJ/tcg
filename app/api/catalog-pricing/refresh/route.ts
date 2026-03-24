import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { MEGA_EVOLUTION_SERIES_NAME } from "@/lib/catalogPricingConstants";
import { fetchLiveCardPricingGbpForCard } from "@/lib/liveCardPricingGbp";
import { getRelationshipDocumentId, toPayloadRelationshipId } from "@/lib/relationshipId";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

/**
 * Refresh cached GBP pricing for all master cards in the Mega Evolution series.
 * Requires a logged-in storefront customer. Cron can call the same logic later with a secret.
 */
export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, {
      status: 401,
    });
  }

  const payload = await getPayload({ config });

  const seriesResult = await payload.find({
    collection: "series",
    where: { name: { equals: MEGA_EVOLUTION_SERIES_NAME } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const seriesDoc = seriesResult.docs[0];
  if (!seriesDoc) {
    return jsonResponseWithAuthCookies(
      { error: `Series not found: ${MEGA_EVOLUTION_SERIES_NAME}` },
      authCookieResponse,
      { status: 404 },
    );
  }

  const seriesRelId = toPayloadRelationshipId(
    getRelationshipDocumentId(seriesDoc.id) ?? String(seriesDoc.id),
  );
  if (seriesRelId === undefined) {
    return jsonResponseWithAuthCookies({ error: "Invalid series id" }, authCookieResponse, {
      status: 500,
    });
  }

  const setsResult = await payload.find({
    collection: "sets",
    where: { serieName: { equals: seriesRelId } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });
  if (setsResult.docs.length === 0) {
    return jsonResponseWithAuthCookies(
      { error: `No sets found for series: ${MEGA_EVOLUTION_SERIES_NAME}` },
      authCookieResponse,
      { status: 404 },
    );
  }

  let updated = 0;
  let created = 0;
  let skipped = 0;
  let scanned = 0;
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

    processedSetCodes.push(canonicalSetCode);
    const cardsResult = await payload.find({
      collection: "master-card-list",
      where: { set: { equals: setRelId } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    scanned += cardsResult.docs.length;

    for (const doc of cardsResult.docs) {
      const row = doc as Record<string, unknown>;
      const tcgdexId =
        typeof row.tcgdex_id === "string" && row.tcgdex_id.trim() ? row.tcgdex_id.trim() : "";
      const extStored =
        typeof row.externalId === "string" && row.externalId.trim() ? row.externalId.trim() : "";
      const ext = tcgdexId || extStored;
      const localId = typeof row.localId === "string" && row.localId.trim() ? row.localId.trim() : undefined;
      const masterId = getRelationshipDocumentId(row.id) ?? (typeof row.id === "string" ? row.id : "");
      const masterRel = toPayloadRelationshipId(masterId);
      if (!ext || masterRel === undefined) {
        skipped += 1;
        continue;
      }

      const existingByPrimary = await payload.find({
        collection: "catalog-card-pricing",
        where: { externalId: { equals: ext } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      const existingByBackup =
        extStored && extStored !== ext
          ? await payload.find({
              collection: "catalog-card-pricing",
              where: { externalId: { equals: extStored } },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
          : null;
      const existingDoc = existingByPrimary.docs[0] ?? existingByBackup?.docs[0];

      const liveFromPrimary = await fetchLiveCardPricingGbpForCard({
        externalId: ext,
        setTcgdexId,
        localId,
      });
      const live =
        liveFromPrimary ??
        (extStored && extStored !== ext
          ? await fetchLiveCardPricingGbpForCard({
              externalId: extStored,
              setTcgdexId,
              localId,
            })
          : null);
      if (!live) {
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
        errors.push(ext);
        skipped += 1;
        continue;
      }

      const pricingPayload = {
        tcgplayer: live.tcgplayer,
        cardmarket: live.cardmarket,
        currency: "GBP" as const,
      };

      try {
        if (existingDoc) {
          const eid = getRelationshipDocumentId(existingDoc.id) ?? String(existingDoc.id);
          await payload.update({
            collection: "catalog-card-pricing",
            id: eid,
            data: {
              masterCard: masterRel,
              externalId: ext,
              setCode: canonicalSetCode,
              pricingGbp: pricingPayload,
            },
            overrideAccess: true,
          });
          updated += 1;
        } else {
          await payload.create({
            collection: "catalog-card-pricing",
            data: {
              masterCard: masterRel,
              externalId: ext,
              setCode: canonicalSetCode,
              pricingGbp: pricingPayload,
            },
            overrideAccess: true,
          });
          created += 1;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "write failed";
        errors.push(`${ext}: ${msg}`);
      }
    }
  }

  return jsonResponseWithAuthCookies(
    {
      ok: true,
      seriesName: MEGA_EVOLUTION_SERIES_NAME,
      setCodes: processedSetCodes,
      scanned,
      created,
      updated,
      skipped,
      failedExternalIds: errors.slice(0, 25),
      moreFailures: errors.length > 25,
    },
    authCookieResponse,
  );
}
