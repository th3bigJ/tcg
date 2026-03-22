/**
 * Upserts MEP (`mep`) master cards from local `data/data/Mega Evolution/MEP Black Star Promos/*.ts`
 * and downloads card images from Scrydex (`images.scrydex.com/pokemon/mep-{n}/{small|large}`).
 *
 * TCGdex only lists 10 MEP cards and omits images; Scrydex lists the full English promo run with art.
 * @see https://scrydex.com/pokemon/expansions/mega-evolution-black-star-promos/mep
 *
 * Usage:
 *   node --import tsx/esm scripts/seedMepCardsFromScrydex.ts
 *   node --import tsx/esm scripts/seedMepCardsFromScrydex.ts --dry-run
 *   node --import tsx/esm scripts/seedMepCardsFromScrydex.ts --replace-images
 *   node --import tsx/esm scripts/seedMepCardsFromScrydex.ts --from=11 --to=28
 */

import fs from "fs/promises";
import path from "path";

import nextEnvImport from "@next/env";
import type { Payload } from "payload";

import { parseAllMepCardsFromDisk, type MepJsonCard } from "../lib/mepLocalCardData";
import { updateCardImportStatusDoc } from "../lib/cardImportStatus";

type RelId = number | string;

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; TCG-Seed/1.0; +https://scrydex.com)",
  Accept: "image/*,*/*",
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const getArgNumber = (key: string): number | undefined => {
  const v = getArg(key);
  if (v == null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
};

const pickStage = (subtypes: string[] | undefined, _tcgdexStage: string | undefined): string | undefined => {
  if (subtypes && subtypes.length > 0) {
    const stageSubtype = subtypes.find((s) => /basic|stage|vmax|vstar|mega|level-up/i.test(s));
    if (stageSubtype) return stageSubtype;
  }
  return undefined;
};

const pickTrainerType = (
  supertype: string | undefined,
  subtypes: string[] | undefined,
  _tcgdexType: string | undefined,
): string | undefined => {
  if ((supertype || "").toLowerCase() !== "trainer") return undefined;
  if (subtypes && subtypes.length > 0) return subtypes[0];
  return undefined;
};

const pickEnergyType = (
  supertype: string | undefined,
  subtypes: string[] | undefined,
  _tcgdexType: string | undefined,
): string | undefined => {
  if ((supertype || "").toLowerCase() !== "energy") return undefined;
  if (subtypes && subtypes.length > 0) return subtypes[0];
  return undefined;
};

const getMimeFromContentType = (contentType: string | null): string | undefined => {
  if (!contentType) return undefined;
  const [mime] = contentType.split(";").map((part) => part.trim());
  return mime || undefined;
};

const extFromMime = (mime: string): string => {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/gif") return "gif";
  return "bin";
};

const bytesToFile = (buffer: Buffer, mimetype: string, name: string) => ({
  data: buffer,
  mimetype,
  name,
  size: buffer.byteLength,
});

const fetchImageBuffer = async (url: string): Promise<{ buffer: Buffer; mime: string; ext: string }> => {
  const response = await fetch(url, { redirect: "follow", headers: FETCH_HEADERS });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  const mime = getMimeFromContentType(response.headers.get("content-type"));
  if (!mime || !mime.startsWith("image/")) {
    throw new Error(`Expected image content type for ${url}, got ${mime ?? "unknown"}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mime, ext: extFromMime(mime) };
};

async function removeExistingCardMedia(
  payload: Payload,
  setCode: string,
  cardLocalIdPadded: string,
  quality: "low" | "high",
): Promise<void> {
  const existing = await payload.find({
    collection: "card-media",
    where: {
      and: [
        { setCode: { equals: setCode } },
        { cardLocalId: { equals: cardLocalIdPadded } },
        { quality: { equals: quality } },
      ],
    },
    limit: 50,
    select: { id: true },
    overrideAccess: true,
  });
  for (const doc of existing.docs) {
    await payload.delete({
      collection: "card-media",
      id: doc.id,
      overrideAccess: true,
    });
  }
}

async function findCardMediaId(
  payload: Payload,
  setCode: string,
  cardLocalIdPadded: string,
  quality: "low" | "high",
): Promise<RelId | undefined> {
  const existing = await payload.find({
    collection: "card-media",
    where: {
      and: [
        { setCode: { equals: setCode } },
        { cardLocalId: { equals: cardLocalIdPadded } },
        { quality: { equals: quality } },
      ],
    },
    limit: 1,
    select: { id: true },
    overrideAccess: true,
  });
  if (existing.totalDocs > 0) return existing.docs[0].id;
  return undefined;
}

async function createCardMedia(
  payload: Payload,
  args: {
    setCode: string;
    cardLocalIdPadded: string;
    quality: "low" | "high";
    cardName: string;
    imageUrl: string;
  },
): Promise<RelId> {
  const { buffer, mime, ext } = await fetchImageBuffer(args.imageUrl);
  const created = await payload.create({
    collection: "card-media",
    data: {
      alt: `${args.cardName} ${args.quality}`,
      quality: args.quality,
      setCode: args.setCode,
      cardLocalId: args.cardLocalIdPadded,
    },
    file: bytesToFile(
      buffer,
      mime,
      `${args.setCode}-${args.cardLocalIdPadded}-${args.quality}.${ext}`,
    ),
    overrideAccess: true,
  });
  return created.id;
}

async function ensureCardMedia(
  payload: Payload,
  args: {
    setCode: string;
    cardLocalIdPadded: string;
    quality: "low" | "high";
    cardName: string;
    imageUrl: string;
    replaceImages: boolean;
  },
): Promise<RelId> {
  if (args.replaceImages) {
    await removeExistingCardMedia(payload, args.setCode, args.cardLocalIdPadded, args.quality);
  } else {
    const existingId = await findCardMediaId(
      payload,
      args.setCode,
      args.cardLocalIdPadded,
      args.quality,
    );
    if (existingId != null) return existingId;
  }
  return createCardMedia(payload, args);
}

function cardInRange(card: MepJsonCard, from?: number, to?: number): boolean {
  const n = Number(card.number);
  if (!Number.isFinite(n)) return false;
  if (from != null && n < from) return false;
  if (to != null && n > to) return false;
  return true;
}

export default async function seedMepCardsFromScrydex(): Promise<void> {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const dryRun = process.argv.includes("--dry-run");
  const replaceImages = process.argv.includes("--replace-images");
  const skipExisting = process.argv.includes("--skip-existing");
  const fromN = getArgNumber("from");
  const toN = getArgNumber("to");

  const setCode = "mep";
  const allCards = await parseAllMepCardsFromDisk("scrydex");
  const cards = allCards.filter((c) => cardInRange(c, fromN, toN));

  if (cards.length === 0) {
    console.error("No cards match --from/--to filters.");
    process.exit(1);
  }

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const setDoc = await payload.find({
    collection: "sets",
    where: { code: { equals: setCode } },
    limit: 1,
    depth: 0,
    select: { id: true, name: true, cardCountOfficial: true, cardCountTotal: true },
    overrideAccess: true,
  });

  if (setDoc.totalDocs === 0) {
    console.error(`No Payload set with code "${setCode}". Seed the set first.`);
    await payload.destroy();
    process.exit(1);
  }

  const setId = setDoc.docs[0].id;
  const setNameRaw = setDoc.docs[0].name;
  const setName =
    typeof setNameRaw === "string" && setNameRaw.trim().length > 0 ? setNameRaw : setCode;
  const setTotal = Number(
    setDoc.docs[0].cardCountOfficial || setDoc.docs[0].cardCountTotal || 0,
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let imageErrors = 0;

  for (let index = 0; index < cards.length; index++) {
    const card = cards[index];
    const cardName = card.name.trim();
    const localIdRaw = String(card.number).trim();
    const localIdPadded = localIdRaw.padStart(3, "0");
    const cardNumber =
      setTotal > 0 ? `${localIdPadded}/${setTotal}` : localIdPadded;
    const fullDisplayName = `${cardName} ${cardNumber} ${setName}`.trim();

    const hpFromJson = Number(card.hp);
    const hp = Number.isFinite(hpFromJson) ? hpFromJson : undefined;

    const masterData: Record<string, unknown> = {
      set: setId,
      cardName,
      cardNumber,
      fullDisplayName,
      externalId: card.id,
      category: card.supertype,
      localId: localIdRaw,
      rarity: card.rarity,
      subtypes: Array.isArray(card.subtypes) ? card.subtypes : [],
      stage: pickStage(card.subtypes, undefined),
      hp,
      elementTypes: Array.isArray(card.types) ? card.types : [],
      trainerType: pickTrainerType(card.supertype, card.subtypes, undefined),
      energyType: pickEnergyType(card.supertype, card.subtypes, undefined),
      artist: card.artist,
      dexId: (card.nationalPokedexNumbers || []).map((value) => ({ value })),
      isActive: true,
    };

    if (dryRun) {
      console.log(`[dry-run] ${cardName} #${localIdRaw} ← ${card.images.small}`);
      continue;
    }

    console.log(`[${index + 1}/${cards.length}] ${cardName} #${localIdRaw}`);

    const existing = await payload.find({
      collection: "master-card-list",
      where: {
        and: [
          { set: { equals: setId } },
          { localId: { equals: localIdRaw } },
          { cardName: { equals: cardName } },
        ],
      },
      limit: 1,
      select: { id: true },
      overrideAccess: true,
    });

    let masterId: RelId;
    if (existing.totalDocs > 0) {
      masterId = existing.docs[0].id;
      if (skipExisting) {
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
    } else {
      const createdDoc = await payload.create({
        collection: "master-card-list",
        data: masterData,
        overrideAccess: true,
      });
      masterId = createdDoc.id;
      created++;
    }

    try {
      const lowId = await ensureCardMedia(payload, {
        setCode,
        cardLocalIdPadded: localIdPadded,
        quality: "low",
        cardName,
        imageUrl: card.images.small,
        replaceImages,
      });
      const highId = await ensureCardMedia(payload, {
        setCode,
        cardLocalIdPadded: localIdPadded,
        quality: "high",
        cardName,
        imageUrl: card.images.large,
        replaceImages,
      });

      await payload.update({
        collection: "master-card-list",
        id: masterId,
        data: {
          imageLow: lowId,
          imageHigh: highId,
        },
        overrideAccess: true,
      });
    } catch (err) {
      imageErrors++;
      console.error(`  Image error: ${(err as Error).message}`);
    }
  }

  if (!dryRun) {
    const outJson = path.resolve(process.cwd(), "data/cards/en/mep.json");
    await fs.mkdir(path.dirname(outJson), { recursive: true });
    await fs.writeFile(outJson, `${JSON.stringify(allCards, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${path.relative(process.cwd(), outJson)} (Scrydex image URLs, all local MEP files).`);

    await updateCardImportStatusDoc({
      setCode,
      setName,
      source: "local-ts + scrydex-images (seedMepCardsFromScrydex)",
      created,
      updated,
      skipped,
      imageLinksUpdated: Math.max(0, created + updated - imageErrors),
    });
  }

  console.log("");
  console.log(dryRun ? "Dry run complete." : "Done.");
  if (!dryRun) {
    console.log(`Created: ${created} | Updated: ${updated} | Skipped: ${skipped} | Image errors: ${imageErrors}`);
  }

  await payload.destroy();
  if (!dryRun && imageErrors > 0) process.exit(1);
}

seedMepCardsFromScrydex().catch((err) => {
  console.error(err);
  process.exit(1);
});
