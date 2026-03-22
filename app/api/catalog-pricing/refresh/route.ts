import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { ASCENDED_HEROES_SET_CODE } from "@/lib/catalogPricingConstants";
import { fetchLiveCardPricingGbp } from "@/lib/liveCardPricingGbp";
import { getRelationshipDocumentId, toPayloadRelationshipId } from "@/lib/relationshipId";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

/**
 * Test-only: refresh cached GBP pricing for all master cards in Ascended Heroes (`me2pt5`).
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

  const setResult = await payload.find({
    collection: "sets",
    where: { code: { equals: ASCENDED_HEROES_SET_CODE } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const setDoc = setResult.docs[0];
  if (!setDoc) {
    return jsonResponseWithAuthCookies(
      { error: `Set not found: ${ASCENDED_HEROES_SET_CODE}` },
      authCookieResponse,
      { status: 404 },
    );
  }

  const setRelId = toPayloadRelationshipId(getRelationshipDocumentId(setDoc.id) ?? String(setDoc.id));
  if (setRelId === undefined) {
    return jsonResponseWithAuthCookies({ error: "Invalid set id" }, authCookieResponse, { status: 500 });
  }

  const cardsResult = await payload.find({
    collection: "master-card-list",
    where: { set: { equals: setRelId } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  let updated = 0;
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const doc of cardsResult.docs) {
    const row = doc as Record<string, unknown>;
    const ext =
      typeof row.externalId === "string" && row.externalId.trim() ? row.externalId.trim() : "";
    const masterId = getRelationshipDocumentId(row.id) ?? (typeof row.id === "string" ? row.id : "");
    const masterRel = toPayloadRelationshipId(masterId);
    if (!ext || masterRel === undefined) {
      skipped += 1;
      continue;
    }

    const live = await fetchLiveCardPricingGbp(ext);
    if (!live) {
      errors.push(ext);
      skipped += 1;
      continue;
    }

    const pricingPayload = {
      tcgplayer: live.tcgplayer,
      cardmarket: live.cardmarket,
      currency: "GBP" as const,
    };

    const existing = await payload.find({
      collection: "catalog-card-pricing",
      where: { externalId: { equals: ext } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const existingDoc = existing.docs[0];
    try {
      if (existingDoc) {
        const eid = getRelationshipDocumentId(existingDoc.id) ?? String(existingDoc.id);
        await payload.update({
          collection: "catalog-card-pricing",
          id: eid,
          data: {
            masterCard: masterRel,
            externalId: ext,
            setCode: ASCENDED_HEROES_SET_CODE,
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
            setCode: ASCENDED_HEROES_SET_CODE,
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

  return jsonResponseWithAuthCookies(
    {
      ok: true,
      setCode: ASCENDED_HEROES_SET_CODE,
      scanned: cardsResult.docs.length,
      created,
      updated,
      skipped,
      failedExternalIds: errors.slice(0, 25),
      moreFailures: errors.length > 25,
    },
    authCookieResponse,
  );
}
