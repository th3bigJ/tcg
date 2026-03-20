import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";
import type { Payload } from "payload";
import { updateCardImportStatusDoc } from "../lib/cardImportStatus";

type RelId = number | string;

type JsonCard = {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  number?: string;
  artist?: string;
  rarity?: string;
  nationalPokedexNumbers?: number[];
  images?: {
    small?: string;
    large?: string;
  };
};

type TCGdexCardBrief = {
  id: string;
  localId?: string | number;
  name?: string;
};

type TCGdexSet = {
  id: string;
  cards?: TCGdexCardBrief[];
};

type TCGdexCardFull = {
  id: string;
  localId?: string | number;
  name?: string;
  category?: string;
  rarity?: string;
  illustrator?: string;
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  stage?: string;
  trainerType?: string;
  energyType?: string;
  regulationMark?: string;
  variants?: {
    firstEdition?: boolean;
    holo?: boolean;
    normal?: boolean;
    reverse?: boolean;
    wPromo?: boolean;
  };
  dexId?: number[];
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const normalizeName = (value: string | undefined): string =>
  (value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const normalizeLocalId = (value: string | number | undefined): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return String(Number(raw));
  return raw.toLowerCase();
};

const makeCompositeKey = (setCode: string, localId: string, name: string): string =>
  `${setCode.toLowerCase()}|${localId}|${normalizeName(name)}`;

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
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  const mime = getMimeFromContentType(response.headers.get("content-type"));
  if (!mime || !mime.startsWith("image/")) {
    throw new Error(`Expected image content type for ${url}, got ${mime ?? "unknown"}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mime, ext: extFromMime(mime) };
};

const pickStage = (subtypes: string[] | undefined, tcgdexStage: string | undefined): string | undefined => {
  if (subtypes && subtypes.length > 0) {
    const stageSubtype = subtypes.find((s) => /basic|stage|vmax|vstar|mega|level-up/i.test(s));
    if (stageSubtype) return stageSubtype;
  }
  return tcgdexStage;
};

const pickTrainerType = (supertype: string | undefined, subtypes: string[] | undefined, tcgdexType: string | undefined): string | undefined => {
  if ((supertype || "").toLowerCase() !== "trainer") return undefined;
  if (subtypes && subtypes.length > 0) return subtypes[0];
  return tcgdexType;
};

const pickEnergyType = (supertype: string | undefined, subtypes: string[] | undefined, tcgdexType: string | undefined): string | undefined => {
  if ((supertype || "").toLowerCase() !== "energy") return undefined;
  if (subtypes && subtypes.length > 0) return subtypes[0];
  return tcgdexType;
};

const loadJsonCards = async (filePath: string): Promise<JsonCard[]> => {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`Expected array in ${filePath}`);
  return parsed as JsonCard[];
};

const getCardMediaId = async (
  payload: Payload,
  params: {
    setCode: string;
    cardLocalId: string;
    quality: "low" | "high";
    cardName: string;
    imageUrl?: string;
  },
): Promise<RelId | undefined> => {
  const existing = await payload.find({
    collection: "card-media",
    where: {
      and: [
        { setCode: { equals: params.setCode } },
        { cardLocalId: { equals: params.cardLocalId } },
        { quality: { equals: params.quality } },
      ],
    },
    limit: 1,
    select: { id: true },
    overrideAccess: true,
  });

  if (existing.totalDocs > 0) return existing.docs[0].id;
  if (!params.imageUrl) return undefined;

  const { buffer, mime, ext } = await fetchImageBuffer(params.imageUrl);
  const created = await payload.create({
    collection: "card-media",
    data: {
      alt: `${params.cardName} ${params.quality}`,
      quality: params.quality,
      setCode: params.setCode,
      cardLocalId: params.cardLocalId,
    },
    file: bytesToFile(buffer, mime, `${params.setCode}-${params.cardLocalId}-${params.quality}.${ext}`),
    overrideAccess: true,
  });
  return created.id;
};

export default async function importSetCardsFromJson() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const setCode = getArg("set") || "base1";
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const sourceFile = path.resolve(process.cwd(), `data/cards/en/${setCode}.json`);
  const reportPath = path.resolve(process.cwd(), `docs/card-import-report-${setCode}.md`);

  const jsonCards = await loadJsonCards(sourceFile);
  const tcgdex = new TCGdex("en");

  const payload = dryRun
    ? null
    : await (async () => {
        const payloadConfig = (await import("../payload.config")).default;
        const { getPayload } = await import("payload");
        return getPayload({ config: payloadConfig });
      })();

  let setId: RelId | undefined;
  let setName = setCode;
  let setTotal = 0;

  if (!dryRun) {
    const setDoc = await payload!.find({
      collection: "sets",
      where: { code: { equals: setCode } },
      limit: 1,
      select: { id: true, name: true, cardCountOfficial: true, cardCountTotal: true },
      overrideAccess: true,
    });
    if (setDoc.totalDocs === 0) throw new Error(`Set not found in Payload for code=${setCode}`);
    setId = setDoc.docs[0].id;
    setName = setDoc.docs[0].name || setCode;
    setTotal = Number(setDoc.docs[0].cardCountOfficial || setDoc.docs[0].cardCountTotal || 0);
  }

  const tcgSet = (await tcgdex.fetch("sets", setCode)) as TCGdexSet | undefined;
  const tcgCards = tcgSet?.cards || [];
  const tcgByComposite = new Map<string, TCGdexCardBrief[]>();
  const tcgByLocal = new Map<string, TCGdexCardBrief[]>();
  const tcgByName = new Map<string, TCGdexCardBrief[]>();

  for (const c of tcgCards) {
    const local = normalizeLocalId(c.localId);
    const name = normalizeName(c.name);
    const composite = makeCompositeKey(setCode, local, c.name || "");

    if (!tcgByComposite.has(composite)) tcgByComposite.set(composite, []);
    tcgByComposite.get(composite)!.push(c);

    if (!tcgByLocal.has(local)) tcgByLocal.set(local, []);
    tcgByLocal.get(local)!.push(c);

    if (!tcgByName.has(name)) tcgByName.set(name, []);
    tcgByName.get(name)!.push(c);
  }

  let created = 0;
  let updated = 0;
  let unmatched = 0;
  let ambiguous = 0;
  let errors = 0;
  const reportLines: string[] = [
    `# Card Import Report (${setCode})`,
    "",
    "## Unmatched / Ambiguous",
    "",
  ];

  const cardsToProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? jsonCards.slice(0, limit)
      : jsonCards;

  for (let index = 0; index < cardsToProcess.length; index++) {
    const card = cardsToProcess[index];
    const cardName = card.name?.trim();
    const localIdRaw = String(card.number || "").trim();
    const localIdNormalized = normalizeLocalId(localIdRaw);
    if (!cardName || !localIdRaw) {
      errors++;
      reportLines.push(`- Error: missing name or number for JSON id \`${card.id}\``);
      continue;
    }

    const compKey = makeCompositeKey(setCode, localIdNormalized, cardName);
    const exact = tcgByComposite.get(compKey) || [];
    const byLocal = tcgByLocal.get(localIdNormalized) || [];
    const byName = tcgByName.get(normalizeName(cardName)) || [];

    let chosen: TCGdexCardBrief | undefined;
    let matchMode = "none";
    if (exact.length === 1) {
      chosen = exact[0];
      matchMode = "exact";
    } else if (exact.length > 1) {
      ambiguous++;
      reportLines.push(`- Ambiguous exact match: \`${card.id}\` (${cardName} #${localIdRaw})`);
    } else if (byLocal.length === 1) {
      chosen = byLocal[0];
      matchMode = "localId";
    } else if (byName.length === 1) {
      chosen = byName[0];
      matchMode = "name";
    } else {
      unmatched++;
      reportLines.push(`- Unmatched: \`${card.id}\` (${cardName} #${localIdRaw})`);
    }

    let tcgFull: TCGdexCardFull | undefined;
    if (chosen?.id) {
      try {
        tcgFull = (await tcgdex.fetch("cards", chosen.id)) as TCGdexCardFull | undefined;
      } catch {
        // Keep going with JSON-only data if TCGdex card fetch fails.
      }
    }

    const hpFromJson = Number(card.hp);
    const hp = Number.isFinite(hpFromJson) ? hpFromJson : tcgFull?.hp;
    const cardTotal = setTotal || 0;
    const cardNumber = cardTotal > 0 ? `${localIdRaw.padStart(3, "0")}/${cardTotal}` : localIdRaw;
    const fullDisplayName = `${cardName} ${cardNumber} ${setName}`.trim();

    const masterData: Record<string, unknown> = {
      set: setId,
      cardName,
      cardNumber,
      fullDisplayName,
      externalId: tcgFull?.id || card.id,
      category: card.supertype || tcgFull?.category,
      localId: localIdRaw,
      rarity: card.rarity || tcgFull?.rarity,
      subtypes: Array.isArray(card.subtypes) ? card.subtypes : [],
      stage: pickStage(card.subtypes, tcgFull?.stage),
      hp,
      elementTypes: Array.isArray(card.types) ? card.types : (tcgFull?.types || []),
      evolveFrom: card.evolvesFrom || tcgFull?.evolveFrom,
      trainerType: pickTrainerType(card.supertype, card.subtypes, tcgFull?.trainerType),
      energyType: pickEnergyType(card.supertype, card.subtypes, tcgFull?.energyType),
      artist: card.artist || tcgFull?.illustrator,
      variants: tcgFull?.variants
        ? {
            firstEdition: tcgFull.variants.firstEdition ?? false,
            holo: tcgFull.variants.holo ?? false,
            normal: tcgFull.variants.normal ?? false,
            reverse: tcgFull.variants.reverse ?? false,
            wPromo: tcgFull.variants.wPromo ?? false,
          }
        : undefined,
      regulationMark: tcgFull?.regulationMark,
      dexId: (card.nationalPokedexNumbers || tcgFull?.dexId || []).map((value) => ({ value })),
      isActive: true,
    };

    if (dryRun) {
      console.log(`[dry-run] ${cardName} #${localIdRaw} match=${matchMode}`);
      continue;
    }

    try {
      console.log(`[${index + 1}/${cardsToProcess.length}] Upserting ${cardName} #${localIdRaw} (match=${matchMode})`);
      const existing = await payload!.find({
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
        await payload!.update({
          collection: "master-card-list",
          id: masterId,
          data: masterData,
          overrideAccess: true,
        });
        updated++;
      } else {
        const createdDoc = await payload!.create({
          collection: "master-card-list",
          data: masterData,
          overrideAccess: true,
        });
        masterId = createdDoc.id;
        created++;
      }

      const imageLowId = await getCardMediaId(payload!, {
        setCode,
        cardLocalId: localIdRaw.padStart(3, "0"),
        quality: "low",
        cardName,
        imageUrl: card.images?.small,
      });
      const imageHighId = await getCardMediaId(payload!, {
        setCode,
        cardLocalId: localIdRaw.padStart(3, "0"),
        quality: "high",
        cardName,
        imageUrl: card.images?.large,
      });

      if (imageLowId || imageHighId) {
        await payload!.update({
          collection: "master-card-list",
          id: masterId,
          data: {
            ...(imageLowId ? { imageLow: imageLowId } : {}),
            ...(imageHighId ? { imageHigh: imageHighId } : {}),
          },
          overrideAccess: true,
        });
      }
    } catch (error) {
      errors++;
      reportLines.push(`- Error on \`${card.id}\`: ${(error as Error).message}`);
    }
  }

  reportLines.push("");
  reportLines.push("## Summary");
  reportLines.push("");
  reportLines.push(`- Created: ${created}`);
  reportLines.push(`- Updated: ${updated}`);
  reportLines.push(`- Unmatched: ${unmatched}`);
  reportLines.push(`- Ambiguous: ${ambiguous}`);
  reportLines.push(`- Errors: ${errors}`);
  await fs.writeFile(reportPath, reportLines.join("\n"), "utf8");

  if (!dryRun) {
    await updateCardImportStatusDoc({
      setCode,
      setName: setName,
      source: "local-json + tcgdex-enrichment",
      created,
      updated,
      skipped: unmatched + ambiguous + errors,
      imageLinksUpdated: created + updated,
    });
  }

  console.log("");
  console.log(`Import complete for set=${setCode} (${dryRun ? "dry-run" : "write mode"})`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Ambiguous: ${ambiguous}`);
  console.log(`Errors: ${errors}`);
  console.log(`Report: ${reportPath}`);

  if (!dryRun && payload) {
    await payload.destroy();
    process.exit(errors > 0 ? 1 : 0);
  }
}

importSetCardsFromJson().catch((err) => {
  console.error(err);
  process.exit(1);
});
