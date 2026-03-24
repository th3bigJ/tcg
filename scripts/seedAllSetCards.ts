import fs from "fs/promises";
import path from "path";

import TCGdex from "@tcgdex/sdk";
import nextEnvImport from "@next/env";

type Payload = Awaited<ReturnType<typeof import("payload").getPayload>>;

type PayloadSet = {
  id: number | string;
  code?: string | null;
  name?: string | null;
};

type SetWithCards = {
  id: string;
  name?: string;
  cardCount?: { total?: number; official?: number };
  cards: Array<{ id: string; localId: string; name?: string }>;
};

type FullCard = {
  id: string;
  localId: string | number;
  name: string;
  category?: string;
  illustrator?: string;
  rarity?: string;
  set?: { id?: string; name?: string; cardCount?: { total?: number; official?: number } };
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  stage?: string;
  trainerType?: string;
  energyType?: string;
  regulationMark?: string;
  dexId?: number[];
  image?: string;
  getImageURL?: (quality: string, ext: string) => string;
};

type ProgressEntry = {
  checked: boolean;
  code: string;
  note: string;
};

const PROGRESS_PATH = path.resolve(process.cwd(), "docs/tcgdex-card-seeding-progress.md");

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const getArgNumber = (key: string): number | undefined => {
  const value = getArg(key);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const getCardImageUrl = (card: FullCard, quality: "high" | "low", ext: string): string | null => {
  if (typeof card.getImageURL === "function") return card.getImageURL(quality, ext);
  if (card.image) return `${card.image}/${quality}.${ext}`;
  return null;
};

const toContentType = (filename: string): string => {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
};

const parseProgress = (content: string): Map<string, ProgressEntry> => {
  const map = new Map<string, ProgressEntry>();
  const lines = content.split("\n");

  for (const line of lines) {
    const match = line.match(/^\s*-\s*\[( |x)\]\s*`([^`]+)`(?:\s*-\s*(.+))?\s*$/i);
    if (!match) continue;
    const checked = match[1].toLowerCase() === "x";
    const code = match[2].trim();
    const note = (match[3] ?? "").trim();
    map.set(code, { checked, code, note });
  }

  return map;
};

const formatProgress = (entries: ProgressEntry[]): string => {
  const header = [
    "# TCGdex Card Seeding Progress",
    "",
    "Record of which `sets.code` values have completed TCGdex import for:",
    "- `master-card-list` data",
    "- `card-media` low + high images",
    "- image upload to R2 via Payload storage plugin",
    "",
    "Use `npm run seed:cards:all-sets` to process pending sets.",
    "",
    "## Set Status",
    "",
  ];

  const lines = entries.map((entry) => {
    const checkbox = entry.checked ? "x" : " ";
    const suffix = entry.note ? ` - ${entry.note}` : "";
    return `- [${checkbox}] \`${entry.code}\`${suffix}`;
  });

  return [...header, ...lines, ""].join("\n");
};

const ensureProgressFile = async (): Promise<void> => {
  try {
    await fs.access(PROGRESS_PATH);
  } catch {
    const initial = formatProgress([
      {
        checked: true,
        code: "base1",
        note: "Completed before tracker was added.",
      },
    ]);
    await fs.writeFile(PROGRESS_PATH, initial, "utf8");
  }
};

const updateProgressForSets = async (
  allSets: Array<{ code: string; name: string }>,
  updates: Map<string, string>,
): Promise<void> => {
  await ensureProgressFile();
  const currentRaw = await fs.readFile(PROGRESS_PATH, "utf8");
  const current = parseProgress(currentRaw);

  for (const set of allSets) {
    const existing = current.get(set.code);
    if (!existing) {
      current.set(set.code, {
        checked: false,
        code: set.code,
        note: set.name,
      });
    } else if (!existing.note) {
      current.set(set.code, {
        ...existing,
        note: set.name,
      });
    }
  }

  for (const [code, note] of updates.entries()) {
    const existing = current.get(code);
    current.set(code, {
      checked: true,
      code,
      note: note || existing?.note || "",
    });
  }

  const sorted = [...current.values()].sort((a, b) => a.code.localeCompare(b.code));
  await fs.writeFile(PROGRESS_PATH, formatProgress(sorted), "utf8");
};

const downloadBuffer = async (url: string, maxRetries = 3): Promise<Buffer> => {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr ?? new Error("Download failed after retries");
};

const upsertCardMedia = async (
  payload: Payload,
  args: {
    setCode: string;
    localIdPadded: string;
    displayName: string;
    quality: "low" | "high";
    imageBuffer: Buffer;
  },
): Promise<number | string> => {
  const existing = await payload.find({
    collection: "card-media",
    where: {
      and: [
        { setCode: { equals: args.setCode } },
        { cardLocalId: { equals: args.localIdPadded } },
        { quality: { equals: args.quality } },
      ],
    },
    limit: 1,
    select: { id: true },
    overrideAccess: true,
  });

  const filename = `${args.setCode}-${args.localIdPadded}-${args.quality}.webp`;
  const mediaData = {
    alt: `${args.displayName} ${args.quality}`,
    quality: args.quality,
    setCode: args.setCode,
    cardLocalId: args.localIdPadded,
  };

  if (existing.docs[0]?.id) {
    const updated = await payload.update({
      collection: "card-media",
      id: existing.docs[0].id,
      data: mediaData,
      file: {
        data: args.imageBuffer,
        mimetype: toContentType(filename),
        name: filename,
        size: args.imageBuffer.byteLength,
      },
      overrideAccess: true,
    });
    return updated.id;
  }

  const created = await payload.create({
    collection: "card-media",
    data: mediaData,
    file: {
      data: args.imageBuffer,
      mimetype: toContentType(filename),
      name: filename,
      size: args.imageBuffer.byteLength,
    },
    overrideAccess: true,
  });
  return created.id;
};

export default async function seedAllSetCards() {
  const { loadEnvConfig } = nextEnvImport as { loadEnvConfig: (dir: string, dev: boolean) => unknown };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const onlySet = getArg("set");
  const limitSets = getArgNumber("limit-sets");
  const limitCards = getArgNumber("limit-cards");
  const includeCompleted = process.argv.includes("--include-completed");
  const dryRun = process.argv.includes("--dry-run");

  const tcgdex = new TCGdex("en");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const setsResult = await payload.find({
    collection: "sets",
    where: { code: { exists: true } },
    depth: 0,
    limit: 1000,
    sort: "code",
    select: { id: true, code: true, name: true },
    overrideAccess: true,
  });

  const allSets = (setsResult.docs as PayloadSet[])
    .filter((set) => typeof set.code === "string" && set.code.trim().length > 0)
    .map((set) => ({
      id: set.id,
      code: String(set.code),
      name: typeof set.name === "string" ? set.name : String(set.code),
    }));

  await ensureProgressFile();
  const progressRaw = await fs.readFile(PROGRESS_PATH, "utf8");
  const progress = parseProgress(progressRaw);

  const filteredByArgs = allSets.filter((set) => {
    if (onlySet && set.code !== onlySet) return false;
    if (!includeCompleted && progress.get(set.code)?.checked) return false;
    return true;
  });

  const setsToProcess =
    typeof limitSets === "number" ? filteredByArgs.slice(0, limitSets) : filteredByArgs;

  if (setsToProcess.length === 0) {
    console.log("No sets to process.");
    await updateProgressForSets(
      allSets.map((s) => ({ code: s.code, name: s.name })),
      new Map(),
    );
    await payload.destroy();
    process.exit(0);
  }

  console.log(`Processing ${setsToProcess.length} set(s)...`);

  const completedProgressUpdates = new Map<string, string>();

  for (const set of setsToProcess) {
    console.log(`\n=== Set ${set.code} (${set.name}) ===`);
    const fullSet = (await tcgdex.fetch("sets", set.code)) as SetWithCards | undefined;
    if (!fullSet?.cards?.length) {
      console.warn(`No cards returned for set ${set.code}, skipping.`);
      continue;
    }

    const cardsToProcess =
      typeof limitCards === "number"
        ? fullSet.cards.slice(0, Math.min(limitCards, fullSet.cards.length))
        : fullSet.cards;

    if (!dryRun) {
      await payload.update({
        collection: "sets",
        id: set.id,
        data: {
          cardCountTotal: fullSet.cardCount?.total,
          cardCountOfficial: fullSet.cardCount?.official,
        },
        overrideAccess: true,
      });
    }

    let cardWrites = 0;
    let imageWrites = 0;

    for (let i = 0; i < cardsToProcess.length; i++) {
      const cardResume = cardsToProcess[i];
      const fullCard = (await tcgdex.fetch("cards", cardResume.id)) as FullCard | undefined;
      if (!fullCard) {
        console.warn(`Card fetch failed: ${cardResume.id}`);
        continue;
      }

      const externalId = String(fullCard.id);
      const localId = String(fullCard.localId);
      const localIdPadded = localId.padStart(3, "0");
      const cardCountOfficial = fullSet.cardCount?.official ?? fullCard.set?.cardCount?.official;
      const cardCountTotal = fullSet.cardCount?.total ?? fullCard.set?.cardCount?.total;
      const displayCount = typeof cardCountOfficial === "number" ? cardCountOfficial : cardCountTotal;
      const cardNumber = typeof displayCount === "number" ? `${localIdPadded}/${displayCount}` : localIdPadded;
      const setName = fullCard.set?.name ?? fullSet.name ?? set.name;
      const fullDisplayName = `${fullCard.name} ${cardNumber} ${setName}`.trim();

      const data = {
        set: set.id,
        cardName: fullCard.name,
        cardNumber,
        fullDisplayName,
        category: fullCard.category ?? undefined,
        localId,
        rarity: fullCard.rarity ?? undefined,
        subtypes: fullCard.stage ? [fullCard.stage] : [],
        stage: fullCard.stage ?? undefined,
        hp: fullCard.hp ?? undefined,
        elementTypes: fullCard.types ?? [],
        evolveFrom: fullCard.evolveFrom ?? undefined,
        trainerType: fullCard.trainerType ?? undefined,
        energyType: fullCard.energyType ?? undefined,
        artist: fullCard.illustrator ?? undefined,
        externalId,
        regulationMark: fullCard.regulationMark ?? undefined,
        dexId: fullCard.dexId?.length ? fullCard.dexId.map((v) => ({ value: v })) : undefined,
        isActive: true,
      };

      if (dryRun) {
        console.log(`[dry-run] ${set.code} ${i + 1}/${cardsToProcess.length}: ${fullDisplayName}`);
        continue;
      }

      const existingCard = await payload.find({
        collection: "master-card-list",
        where: { externalId: { equals: externalId } },
        limit: 1,
        select: { id: true },
        overrideAccess: true,
      });

      const masterCard =
        existingCard.docs[0]?.id != null
          ? await payload.update({
              collection: "master-card-list",
              id: existingCard.docs[0].id,
              data,
              overrideAccess: true,
            })
          : await payload.create({
              collection: "master-card-list",
              data,
              overrideAccess: true,
            });
      cardWrites++;

      const highUrl = getCardImageUrl(fullCard, "high", "webp");
      const lowUrl = getCardImageUrl(fullCard, "low", "webp");
      if (!highUrl || !lowUrl) continue;

      try {
        const [lowBuffer, highBuffer] = await Promise.all([
          downloadBuffer(lowUrl),
          downloadBuffer(highUrl),
        ]);

        const [lowId, highId] = await Promise.all([
          upsertCardMedia(payload, {
            setCode: set.code,
            localIdPadded,
            displayName: fullDisplayName,
            quality: "low",
            imageBuffer: lowBuffer,
          }),
          upsertCardMedia(payload, {
            setCode: set.code,
            localIdPadded,
            displayName: fullDisplayName,
            quality: "high",
            imageBuffer: highBuffer,
          }),
        ]);

        await payload.update({
          collection: "master-card-list",
          id: masterCard.id,
          data: {
            imageLow: lowId,
            imageHigh: highId,
          },
          overrideAccess: true,
        });
        imageWrites++;
      } catch (error) {
        console.warn(`Image sync failed for ${set.code}/${localIdPadded}:`, error);
      }
    }

    if (!dryRun && cardsToProcess.length === fullSet.cards.length) {
      const now = new Date().toISOString().replace("T", " ").replace("Z", " UTC");
      completedProgressUpdates.set(
        set.code,
        `${set.name} | cards: ${cardWrites} | images: ${imageWrites} | completed: ${now}`,
      );
    }
  }

  await updateProgressForSets(
    allSets.map((set) => ({ code: set.code, name: set.name })),
    dryRun ? new Map() : completedProgressUpdates,
  );

  await payload.destroy();
  process.exit(0);
}

seedAllSetCards().catch((err) => {
  console.error(err);
  process.exit(1);
});
