import fs from "fs/promises";
import path from "path";
import TCGdex from "@tcgdex/sdk";
import nextEnvImport from "@next/env";
import { updateCardImportStatusDoc } from "../lib/cardImportStatus";

type RelId = number | string;

type SetRow = {
  id: RelId;
  name?: string | null;
  code?: string | null;
  tcgdexId?: string | null;
  brand?: RelId | { id?: RelId } | null;
};

type TCGdexSet = {
  id: string;
  name?: string;
  cardCount?: {
    total?: number;
    official?: number;
  };
  cards?: Array<{
    id: string;
    localId?: string | number;
    name?: string;
  }>;
};

type TCGdexCard = {
  id: string;
  localId?: string | number;
  name: string;
  category?: string;
  illustrator?: string;
  rarity?: string;
  stage?: string;
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  trainerType?: string;
  energyType?: string;
  regulationMark?: string;
  dexId?: number[];
  variants?: {
    firstEdition?: boolean;
    holo?: boolean;
    normal?: boolean;
    reverse?: boolean;
    wPromo?: boolean;
  };
  image?: string;
  getImageURL?: (quality: "high" | "low", ext: string) => string;
};

type LocalJsonCard = {
  number?: string;
  images?: {
    small?: string;
    large?: string;
  };
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const normalizeNumber = (value: string | number | undefined): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return String(Number(raw));
  return raw.toLowerCase();
};

const toPaddedLocalId = (value: string): string => {
  if (/^\d+$/.test(value)) return value.padStart(3, "0");
  return value;
};

const relationshipId = (value: RelId | { id?: RelId } | null | undefined): RelId | undefined => {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && (typeof value.id === "string" || typeof value.id === "number")) return value.id;
  return undefined;
};

const getMimeFromContentType = (contentType: string | null): string | undefined => {
  if (!contentType) return undefined;
  const [mime] = contentType.split(";").map((s) => s.trim());
  return mime || undefined;
};

const extFromMime = (mime: string): string => {
  if (mime === "image/webp") return "webp";
  if (mime === "image/png") return "png";
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

const fetchImageBuffer = async (url: string) => {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const mime = getMimeFromContentType(res.headers.get("content-type"));
  if (!mime || !mime.startsWith("image/")) {
    throw new Error(`Invalid image mime ${mime ?? "unknown"} from ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mime, ext: extFromMime(mime) };
};

const tcgdexImageUrl = (card: TCGdexCard, quality: "low" | "high"): string | undefined => {
  if (typeof card.getImageURL === "function") return card.getImageURL(quality, "webp");
  if (!card.image) return undefined;
  return `${card.image}/${quality}.webp`;
};

const loadLocalCardFile = async (setCode: string | undefined): Promise<Map<string, LocalJsonCard>> => {
  const byNumber = new Map<string, LocalJsonCard>();
  if (!setCode) return byNumber;

  const filePath = path.resolve(process.cwd(), "data/cards/en", `${setCode}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return byNumber;
    for (const row of parsed as LocalJsonCard[]) {
      const key = normalizeNumber(row.number);
      if (key) byNumber.set(key, row);
    }
  } catch {
    // Local JSON not found means we use TCGdex fallback.
  }
  return byNumber;
};

const ensureCardMedia = async ({
  payload,
  setCodeForMedia,
  cardLocalIdPadded,
  quality,
  cardName,
  imageUrl,
}: {
  payload: Awaited<ReturnType<typeof import("payload").getPayload>>;
  setCodeForMedia: string;
  cardLocalIdPadded: string;
  quality: "low" | "high";
  cardName: string;
  imageUrl?: string;
}): Promise<RelId | undefined> => {
  const existing = await payload.find({
    collection: "card-media",
    where: {
      and: [
        { setCode: { equals: setCodeForMedia } },
        { cardLocalId: { equals: cardLocalIdPadded } },
        { quality: { equals: quality } },
      ],
    },
    limit: 1,
    select: { id: true },
    overrideAccess: true,
  });
  if (existing.totalDocs > 0) return existing.docs[0].id;
  if (!imageUrl) return undefined;

  const { buffer, mime, ext } = await fetchImageBuffer(imageUrl);
  const created = await payload.create({
    collection: "card-media",
    data: {
      alt: `${cardName} ${quality}`,
      quality,
      setCode: setCodeForMedia,
      cardLocalId: cardLocalIdPadded,
    },
    file: bytesToFile(buffer, mime, `${setCodeForMedia}-${cardLocalIdPadded}-${quality}.${ext}`),
    overrideAccess: true,
  });
  return created.id;
};

export default async function importSetCardsFromTcgdex() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const setArg = getArg("set") || "base1";
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const dryRun = process.argv.includes("--dry-run");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const setResult = await payload.find({
    collection: "sets",
    where: {
      or: [{ code: { equals: setArg } }, { tcgdexId: { equals: setArg } }],
    },
    limit: 1,
    depth: 0,
    select: {
      id: true,
      name: true,
      code: true,
      tcgdexId: true,
      brand: true,
    },
    overrideAccess: true,
  });

  const setRow = (setResult.docs[0] || null) as SetRow | null;
  if (!setRow) {
    throw new Error(`No set found for --set=${setArg} (matched against code/tcgdexId)`);
  }

  const setId = setRow.id;
  const brandId = relationshipId(setRow.brand);
  if (brandId == null) {
    throw new Error(`Set ${setRow.id} has no brand relationship`);
  }
  const tcgdexSetId = (setRow.tcgdexId || "").trim();
  if (!tcgdexSetId) {
    throw new Error(`Set ${setRow.id} (${setRow.name || ""}) has no tcgdexId`);
  }
  const setCode = (setRow.code || "").trim();

  const localCardsByNumber = await loadLocalCardFile(setCode || undefined);
  const tcgdex = new TCGdex("en");
  const tcgSet = (await tcgdex.fetch("sets", tcgdexSetId)) as TCGdexSet | undefined;
  if (!tcgSet?.cards?.length) {
    throw new Error(`No cards returned from TCGdex for set ${tcgdexSetId}`);
  }

  if (!dryRun) {
    await payload.update({
      collection: "sets",
      id: setId,
      data: {
        cardCountTotal: tcgSet.cardCount?.total,
        cardCountOfficial: tcgSet.cardCount?.official,
      },
      overrideAccess: true,
    });
  }

  const cards = tcgSet.cards;
  const toProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? cards.slice(0, limit)
      : cards;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let localImageUsed = 0;
  let fallbackImageUsed = 0;
  let imageLinksUpdated = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const brief = toProcess[i];
    const full = (await tcgdex.fetch("cards", brief.id)) as TCGdexCard | undefined;
    if (!full) {
      skipped++;
      continue;
    }

    const localIdRaw = String(full.localId ?? brief.localId ?? "").trim();
    if (!localIdRaw) {
      skipped++;
      continue;
    }
    const localIdNormalized = normalizeNumber(localIdRaw);
    const localIdPadded = toPaddedLocalId(localIdRaw);
    const cardName = full.name || brief.name || full.id;
    const displayCount = tcgSet.cardCount?.official ?? tcgSet.cardCount?.total;
    const cardNumber =
      typeof displayCount === "number" ? `${localIdPadded}/${displayCount}` : localIdPadded;
    const fullDisplayName = `${cardName} ${cardNumber} ${setRow.name || tcgSet.name || ""}`.trim();

    const existing = await payload.find({
      collection: "master-card-list",
      where: { externalId: { equals: full.id } },
      limit: 1,
      select: { id: true },
      overrideAccess: true,
    });

    const cardData = {
      brand: brandId,
      set: setId,
      cardName,
      cardNumber,
      fullDisplayName,
      externalId: full.id,
      category: full.category ?? undefined,
      localId: localIdRaw,
      rarity: full.rarity ?? undefined,
      subtypes: full.stage ? [full.stage] : [],
      stage: full.stage ?? undefined,
      hp: full.hp ?? undefined,
      elementTypes: full.types ?? [],
      evolveFrom: full.evolveFrom ?? undefined,
      trainerType: full.trainerType ?? undefined,
      energyType: full.energyType ?? undefined,
      artist: full.illustrator ?? undefined,
      variants: full.variants
        ? {
            firstEdition: full.variants.firstEdition ?? false,
            holo: full.variants.holo ?? false,
            normal: full.variants.normal ?? false,
            reverse: full.variants.reverse ?? false,
            wPromo: full.variants.wPromo ?? false,
          }
        : undefined,
      regulationMark: full.regulationMark ?? undefined,
      dexId: (full.dexId || []).map((value) => ({ value })),
      isActive: true,
    };

    let masterId: RelId | undefined;
    if (existing.totalDocs > 0) {
      masterId = existing.docs[0].id;
      if (!dryRun) {
        await payload.update({
          collection: "master-card-list",
          id: masterId,
          data: cardData,
          overrideAccess: true,
        });
      }
      updated++;
    } else {
      if (!dryRun) {
        const createdDoc = await payload.create({
          collection: "master-card-list",
          data: cardData,
          overrideAccess: true,
        });
        masterId = createdDoc.id;
      }
      created++;
    }

    const localRow = localCardsByNumber.get(localIdNormalized);
    const lowFromLocal = localRow?.images?.small;
    const highFromLocal = localRow?.images?.large;
    const lowFromTcgdex = tcgdexImageUrl(full, "low");
    const highFromTcgdex = tcgdexImageUrl(full, "high");
    const lowUrl = lowFromLocal || lowFromTcgdex;
    const highUrl = highFromLocal || highFromTcgdex;
    if (lowFromLocal || highFromLocal) localImageUsed++;
    else fallbackImageUsed++;

    if (!dryRun && masterId != null) {
      const setCodeForMedia = setCode || tcgdexSetId;
      const lowMediaId = await ensureCardMedia({
        payload,
        setCodeForMedia,
        cardLocalIdPadded: localIdPadded,
        quality: "low",
        cardName,
        imageUrl: lowUrl,
      });
      const highMediaId = await ensureCardMedia({
        payload,
        setCodeForMedia,
        cardLocalIdPadded: localIdPadded,
        quality: "high",
        cardName,
        imageUrl: highUrl,
      });

      if (lowMediaId || highMediaId) {
        await payload.update({
          collection: "master-card-list",
          id: masterId,
          data: {
            ...(lowMediaId ? { imageLow: lowMediaId } : {}),
            ...(highMediaId ? { imageHigh: highMediaId } : {}),
          },
          overrideAccess: true,
        });
        imageLinksUpdated++;
      }
    }

    console.log(`[${i + 1}/${toProcess.length}] ${cardName} (${localIdRaw})`);
  }

  console.log("");
  console.log(`Import cards complete for set=${setArg} (${dryRun ? "dry-run" : "write mode"})`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Used local JSON images: ${localImageUsed}`);
  console.log(`Used TCGdex fallback images: ${fallbackImageUsed}`);
  console.log(`Cards with image links updated: ${imageLinksUpdated}`);

  if (!dryRun) {
    await updateCardImportStatusDoc({
      setCode: setCode || tcgdexSetId,
      setName: String(setRow.name || tcgSet.name || ""),
      source: "tcgdex-data + local-json-images-with-tcgdex-fallback",
      created,
      updated,
      skipped,
      imageLinksUpdated,
    });
  }

  await payload.destroy();
  process.exit(0);
}

importSetCardsFromTcgdex().catch((err) => {
  console.error(err);
  process.exit(1);
});
