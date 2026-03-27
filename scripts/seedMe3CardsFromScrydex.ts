/**
 * Scrapes the Perfect Order (me3) expansion from Scrydex, downloads each card page,
 * upserts master-card-list entries, and downloads card images into card-media.
 *
 * TCGdex does not yet have me3; Scrydex is the authoritative source.
 * @see https://scrydex.com/pokemon/expansions/perfect-order/me3
 *
 * Usage:
 *   node --import tsx/esm scripts/seedMe3CardsFromScrydex.ts
 *   node --import tsx/esm scripts/seedMe3CardsFromScrydex.ts --dry-run
 *   node --import tsx/esm scripts/seedMe3CardsFromScrydex.ts --replace-images
 *   node --import tsx/esm scripts/seedMe3CardsFromScrydex.ts --skip-existing
 *   node --import tsx/esm scripts/seedMe3CardsFromScrydex.ts --from=1 --to=88
 */

import nextEnvImport from "@next/env";
import type { Payload } from "payload";

import { updateCardImportStatusDoc } from "../lib/cardImportStatus";
import {
  parseScrydexCardHoverFields,
  parseScrydexSubtypes,
  retreatCountFromRetreatCost,
  splitCsvField,
  stageFromSubtypes,
} from "../lib/scrydexPokemonCardHtml";

// ─── Types ────────────────────────────────────────────────────────────────────

type RelId = number | string;

type Me3CardStub = {
  /** Scrydex card page path, e.g. /pokemon/cards/rowlet/me3-10 */
  slugPath: string;
  /** Unpadded card number as found in the URL, e.g. 10 */
  num: number;
};

type Me3CardData = {
  num: number;
  slugPath: string;
  name: string;
  supertype: string;
  subtypes: string[];
  stage?: "Basic" | "Stage1" | "Stage2";
  hp?: number;
  types: string[];
  trainerType?: string;
  energyType?: string;
  artist?: string;
  rarity?: string;
  retreatCost?: number;
  printedNumber?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SET_CODE = "me3";
const EXPANSION_URL = "https://scrydex.com/pokemon/expansions/perfect-order/me3";
const SCRYDEX_BASE = "https://scrydex.com";
const SCRYDEX_IMAGE_BASE = "https://images.scrydex.com/pokemon";

const SCRYDEX_UA =
  "Mozilla/5.0 (compatible; TCG-Seed/1.0; +https://scrydex.com) AppleWebKit/537.36";

const HREF_RE = /href="(\/pokemon\/cards\/[^"/]+\/me3-(\d+))(?:\?[^"]*)?"/g;

// ─── CLI args ─────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes("--dry-run");
const replaceImages = process.argv.includes("--replace-images");
const skipExisting = process.argv.includes("--skip-existing");

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((a) => a.startsWith(`--${key}=`));
  return match ? match.split("=").slice(1).join("=") || undefined : undefined;
};

const getArgNumber = (key: string): number | undefined => {
  const v = getArg(key);
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const fromN = getArgNumber("from");
const toN = getArgNumber("to");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": SCRYDEX_UA },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function scrydexImageUrl(num: number, size: "small" | "medium" | "large"): string {
  return `${SCRYDEX_IMAGE_BASE}/me3-${num}/${size}`;
}

function parseExpansionLinks(html: string): Me3CardStub[] {
  const map = new Map<number, string>();
  let m: RegExpExecArray | null;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html)) !== null) {
    const slugPath = m[1];
    const num = Number(m[2]);
    if (Number.isFinite(num) && !map.has(num)) map.set(num, slugPath);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, slugPath]) => ({ num, slugPath }));
}

function parseRarityFromHtml(html: string): string | undefined {
  // Scrydex shows rarity in the card attributes panel
  const m = html.match(/class="[^"]*text-body-12[^"]*"[^>]*>\s*Rarity\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)\s*</);
  if (m) return m[1].trim() || undefined;
  // Fallback: look for rarity in the hover block fields
  return undefined;
}

function parseCardData(num: number, slugPath: string, html: string): Me3CardData {
  const fields = parseScrydexCardHoverFields(html);

  const name = fields["name"]?.[0]?.trim() ?? fields["pokemon"]?.[0]?.trim() ?? "";
  const supertype = fields["supertype"]?.[0]?.trim() ?? "Pokémon";
  const subtypesCsv = fields["subtypes"]?.[0] ?? "";
  const subtypes = parseScrydexSubtypes(subtypesCsv);
  const stage = stageFromSubtypes(subtypes);

  const hpRaw = fields["hp"]?.[0];
  const hp = hpRaw ? Number(hpRaw) : undefined;

  const typesCsv = fields["types"]?.[0] ?? "";
  const types = typesCsv ? splitCsvField(typesCsv) : [];

  const artistRaw = fields["artist"]?.[0]?.trim() || fields["illustrator"]?.[0]?.trim();
  const artist = artistRaw && artistRaw !== "-" ? artistRaw : undefined;

  const rarityField = fields["rarity"]?.[0]?.trim();
  const rarity = rarityField || parseRarityFromHtml(html);

  const retreatCostRaw = fields["retreat_cost"]?.[0];
  const retreatCost = retreatCountFromRetreatCost(retreatCostRaw);

  // printed_number gives "001/088" — prefer this over constructing from setTotal
  const printedNumber = fields["printed_number"]?.[0]?.trim();

  const sup = supertype.toLowerCase();
  const trainerType =
    sup === "trainer" && subtypes.length > 0 ? subtypes[0] : undefined;
  const energyType =
    sup === "energy" && subtypes.length > 0 ? subtypes[0] : undefined;

  return {
    num,
    slugPath,
    name,
    supertype,
    subtypes,
    stage,
    hp: hp != null && Number.isFinite(hp) ? hp : undefined,
    types,
    trainerType,
    energyType,
    artist,
    rarity,
    retreatCost,
    printedNumber,
  };
}

// ─── Image helpers ────────────────────────────────────────────────────────────

function getMimeFromContentType(ct: string | null): string | undefined {
  if (!ct) return undefined;
  return ct.split(";")[0].trim() || undefined;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  return "bin";
}

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; TCG-Seed/1.0; +https://scrydex.com)",
  Accept: "image/*,*/*",
};

async function fetchImageBuffer(
  url: string,
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const res = await fetch(url, { redirect: "follow", headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const mime = getMimeFromContentType(res.headers.get("content-type"));
  if (!mime?.startsWith("image/"))
    throw new Error(`Expected image for ${url}, got ${mime ?? "unknown"}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buffer: buf, mime, ext: extFromMime(mime) };
}

function bytesToFile(buffer: Buffer, mimetype: string, name: string) {
  return { data: buffer, mimetype, name, size: buffer.byteLength };
}

async function removeExistingCardMedia(
  payload: Payload,
  cardLocalIdPadded: string,
  quality: "low" | "high",
): Promise<void> {
  const existing = await payload.find({
    collection: "card-media",
    where: {
      and: [
        { setCode: { equals: SET_CODE } },
        { cardLocalId: { equals: cardLocalIdPadded } },
        { quality: { equals: quality } },
      ],
    },
    limit: 50,
    select: { id: true },
    overrideAccess: true,
  });
  for (const doc of existing.docs) {
    await payload.delete({ collection: "card-media", id: doc.id, overrideAccess: true });
  }
}

async function findCardMediaId(
  payload: Payload,
  cardLocalIdPadded: string,
  quality: "low" | "high",
): Promise<RelId | undefined> {
  const existing = await payload.find({
    collection: "card-media",
    where: {
      and: [
        { setCode: { equals: SET_CODE } },
        { cardLocalId: { equals: cardLocalIdPadded } },
        { quality: { equals: quality } },
      ],
    },
    limit: 1,
    select: { id: true },
    overrideAccess: true,
  });
  return existing.totalDocs > 0 ? existing.docs[0].id : undefined;
}

async function ensureCardMedia(
  payload: Payload,
  args: {
    cardLocalIdPadded: string;
    quality: "low" | "high";
    cardName: string;
    imageUrl: string;
  },
): Promise<RelId> {
  if (replaceImages) {
    await removeExistingCardMedia(payload, args.cardLocalIdPadded, args.quality);
  } else {
    const existingId = await findCardMediaId(payload, args.cardLocalIdPadded, args.quality);
    if (existingId != null) return existingId;
  }

  const { buffer, mime, ext } = await fetchImageBuffer(args.imageUrl);
  const created = await payload.create({
    collection: "card-media",
    data: {
      alt: `${args.cardName} ${args.quality}`,
      quality: args.quality,
      setCode: SET_CODE,
      cardLocalId: args.cardLocalIdPadded,
    },
    file: bytesToFile(
      buffer,
      mime,
      `${SET_CODE}-${args.cardLocalIdPadded}-${args.quality}.${ext}`,
    ),
    overrideAccess: true,
  });
  return created.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  // ── Find the me3 set ──────────────────────────────────────────────────────

  const setResult = await payload.find({
    collection: "sets",
    where: {
      or: [
        { code: { equals: SET_CODE } },
        { tcgdexId: { equals: SET_CODE } },
        { tcgdexId: { equals: "me03" } },
      ],
    },
    limit: 1,
    depth: 0,
    select: { id: true, name: true, cardCountOfficial: true, cardCountTotal: true },
    overrideAccess: true,
  });

  if (setResult.totalDocs === 0) {
    console.error(
      `No Payload set found with code/tcgdexId "${SET_CODE}" or "me03".\n` +
      `Create the set in the Payload admin UI first (Series: Mega Evolution, code: me3).`,
    );
    await payload.destroy();
    process.exit(1);
  }

  const setDoc = setResult.docs[0] as Record<string, unknown>;
  const setId = setDoc.id as RelId;
  const setName =
    typeof setDoc.name === "string" && setDoc.name.trim() ? setDoc.name.trim() : SET_CODE;
  const setTotal = Number(setDoc.cardCountOfficial || setDoc.cardCountTotal || 0);

  console.log(`Set: ${setName} (id=${setId}, total=${setTotal || "unknown"})`);

  // ── Fetch expansion listing ───────────────────────────────────────────────

  console.log(`\nFetching expansion listing: ${EXPANSION_URL}`);
  const expHtml = await fetchText(EXPANSION_URL);
  const allStubs = parseExpansionLinks(expHtml);
  console.log(`Found ${allStubs.length} me3 card link(s).`);

  const stubs = allStubs.filter(({ num }) => {
    if (fromN != null && num < fromN) return false;
    if (toN != null && num > toN) return false;
    return true;
  });

  if (stubs.length === 0) {
    console.error("No cards match --from/--to range.");
    await payload.destroy();
    process.exit(1);
  }

  // ── Process each card ─────────────────────────────────────────────────────

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let imageErrors = 0;

  for (let i = 0; i < stubs.length; i++) {
    const { num, slugPath } = stubs[i];
    const localIdPadded = String(num).padStart(3, "0");

    console.log(`\n[${i + 1}/${stubs.length}] Fetching card #${num}: https://scrydex.com${slugPath}`);

    let cardData: Me3CardData;
    try {
      const cardHtml = await fetchText(`${SCRYDEX_BASE}${slugPath}`);
      cardData = parseCardData(num, slugPath, cardHtml);
    } catch (err) {
      console.error(`  Error fetching/parsing card #${num}: ${(err as Error).message}`);
      continue;
    }

    if (!cardData.name) {
      console.warn(`  Skipping card #${num}: could not parse name.`);
      continue;
    }

    // Use printed_number from the card page if available (e.g. "001/088"), else fall back
    const cardNumber = cardData.printedNumber ?? (setTotal > 0 ? `${localIdPadded}/${String(setTotal).padStart(3, "0")}` : localIdPadded);
    const externalId = `me3-${num}`;
    const fullDisplayName = `${cardData.name} ${cardNumber} ${setName}`.trim();

    const masterData: Record<string, unknown> = {
      set: setId,
      cardName: cardData.name,
      cardNumber,
      fullDisplayName,
      externalId,
      category: cardData.supertype,
      localId: String(num),
      rarity: cardData.rarity,
      subtypes: cardData.subtypes,
      stage: cardData.stage,
      hp: cardData.hp,
      elementTypes: cardData.types,
      trainerType: cardData.trainerType,
      energyType: cardData.energyType,
      artist: cardData.artist,
      isActive: true,
    };

    if (dryRun) {
      console.log(
        `  [dry-run] ${cardData.name} #${num} (${cardData.supertype}${cardData.rarity ? ` / ${cardData.rarity}` : ""})`,
      );
      continue;
    }

    // ── Upsert master-card-list ─────────────────────────────────────────────

    const existing = await payload.find({
      collection: "master-card-list",
      where: {
        and: [
          { set: { equals: setId } },
          { localId: { equals: String(num) } },
        ],
      },
      limit: 1,
      select: { id: true },
      overrideAccess: true,
    });

    let masterId: RelId;
    if (existing.totalDocs > 0) {
      masterId = existing.docs[0].id as RelId;
      if (skipExisting) {
        console.log(`  Skipping existing card #${num}`);
        skipped++;
        continue;
      }
      await payload.update({
        collection: "master-card-list",
        id: masterId,
        data: masterData,
        overrideAccess: true,
      });
      updated++;
      console.log(`  Updated: ${cardData.name} #${num}`);
    } else {
      const createdDoc = await payload.create({
        collection: "master-card-list",
        data: masterData,
        overrideAccess: true,
      });
      masterId = createdDoc.id as RelId;
      created++;
      console.log(`  Created: ${cardData.name} #${num}`);
    }

    // ── Download images ─────────────────────────────────────────────────────

    try {
      const smallUrl = scrydexImageUrl(num, "small");
      const largeUrl = scrydexImageUrl(num, "large");

      const lowId = await ensureCardMedia(payload, {
        cardLocalIdPadded: localIdPadded,
        quality: "low",
        cardName: cardData.name,
        imageUrl: smallUrl,
      });
      const highId = await ensureCardMedia(payload, {
        cardLocalIdPadded: localIdPadded,
        quality: "high",
        cardName: cardData.name,
        imageUrl: largeUrl,
      });

      await payload.update({
        collection: "master-card-list",
        id: masterId,
        data: { imageLow: lowId, imageHigh: highId },
        overrideAccess: true,
      });
      console.log(`  Images: low=${lowId} high=${highId}`);
    } catch (err) {
      imageErrors++;
      console.error(`  Image error for #${num}: ${(err as Error).message}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n─────────────────────────────────────");
  if (dryRun) {
    console.log("Dry run complete (no writes).");
  } else {
    console.log(
      `Done. Created: ${created} | Updated: ${updated} | Skipped: ${skipped} | Image errors: ${imageErrors}`,
    );
    await updateCardImportStatusDoc({
      setCode: SET_CODE,
      setName,
      source: "scrydex (seedMe3CardsFromScrydex)",
      created,
      updated,
      skipped,
      imageLinksUpdated: Math.max(0, created + updated - imageErrors),
    });
  }

  await payload.destroy();
  if (!dryRun && imageErrors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
