/**
 * Download high and low card images from TCGdex and store local URLs in master_card_list.
 * Files: public/media/cards/high/{setCode}/{localId}.webp and .../low/{setCode}/{localId}.webp
 * URLs stored: /media/cards/high/{setCode}/{localId}.webp and /media/cards/low/{setCode}/{localId}.webp
 * Replaces any existing imageHighUrl / imageLowUrl.
 * @see https://tcgdex.dev/assets
 */
import fs from "fs/promises";
import path from "path";

import TCGdex from "@tcgdex/sdk";
import nextEnvImport from "@next/env";

type Payload = Awaited<ReturnType<typeof import("payload").getPayload>>;

type FullCard = {
  id: string;
  localId: string | number;
  name?: string;
  image?: string;
  getImageURL?: (quality: string, ext: string) => string;
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const getCardImageUrl = (card: FullCard, quality: "high" | "low", ext: string): string | null => {
  if (typeof card.getImageURL === "function") {
    return card.getImageURL(quality, ext);
  }
  if (card.image) return `${card.image}/${quality}.${ext}`;
  return null;
};

const downloadToFile = async (url: string, outputPath: string, maxRetries = 3): Promise<void> => {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
      const arrayBuffer = await res.arrayBuffer();
      await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
      return;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = 2000 * attempt;
        console.warn(`  Retry ${attempt}/${maxRetries} in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr ?? new Error("Download failed after retries");
};

export default async function seedCardImages() {
  const { loadEnvConfig } = nextEnvImport as { loadEnvConfig: (dir: string, dev: boolean) => unknown };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const setCode = getArg("set") ?? "base1";
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const dryRun = process.argv.includes("--dry-run");

  const tcgdex = new TCGdex("en");
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const setResult = await payload.find({
    collection: "sets",
    where: { code: { equals: setCode } },
    limit: 1,
    select: { id: true },
  });
  const setDoc = setResult.docs[0];
  if (!setDoc) {
    console.warn(`Set not found: ${setCode}`);
    await payload.destroy();
    process.exit(1);
  }

  const cardsResult = await payload.find({
    collection: "master-card-list",
    where: { set: { equals: setDoc.id } },
    limit: limit ?? 1000,
    sort: "localId",
    select: { id: true, externalId: true, localId: true, cardName: true },
  });

  const cards = cardsResult.docs as Array<{ id: string | number; externalId: string; localId: string; cardName?: string }>;
  const total = cards.length;
  if (total === 0) {
    console.log(`No cards found for set ${setCode}.`);
    await payload.destroy();
    process.exit(0);
  }

  const baseDir = path.resolve(process.cwd(), "public/media/cards");
  const highDir = path.join(baseDir, "high", setCode);
  const lowDir = path.join(baseDir, "low", setCode);
  if (!dryRun) {
    await ensureDir(highDir);
    await ensureDir(lowDir);
  }

  console.log(`Downloading images for ${total} cards (set=${setCode}), storing in media/cards/{high|low}/${setCode}/, replacing existing URLs.\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const localIdPadded = String(card.localId ?? "").padStart(3, "0");
    const displayName = card.cardName ? `${card.cardName} (${card.localId})` : card.externalId;

    console.log(`[${i + 1}/${total}] ${displayName}`);

    let fullCard: FullCard | undefined;
    try {
      fullCard = (await tcgdex.fetch("cards", card.externalId)) as FullCard | undefined;
    } catch (e) {
      console.warn(`  Failed to fetch from TCGdex: ${e}`);
      errors++;
      continue;
    }

    if (!fullCard) {
      console.warn(`  No card data for ${card.externalId}`);
      errors++;
      continue;
    }

    const highUrl = getCardImageUrl(fullCard, "high", "webp");
    const lowUrl = getCardImageUrl(fullCard, "low", "webp");

    if (!highUrl || !lowUrl) {
      console.warn(`  Missing image URL(s) for ${card.externalId}`);
      skipped++;
      continue;
    }

    // URL stored in DB: path from site root (no leading public/)
    const imageHighUrl = `/media/cards/high/${setCode}/${localIdPadded}.webp`;
    const imageLowUrl = `/media/cards/low/${setCode}/${localIdPadded}.webp`;

    if (dryRun) {
      console.log(`  High -> ${imageHighUrl}`);
      console.log(`  Low  -> ${imageLowUrl}`);
      updated++;
      continue;
    }

    try {
      const highPath = path.join(highDir, `${localIdPadded}.webp`);
      const lowPath = path.join(lowDir, `${localIdPadded}.webp`);
      await downloadToFile(highUrl, highPath);
      await downloadToFile(lowUrl, lowPath);
    } catch (e) {
      console.warn(`  Download failed: ${e}`);
      errors++;
      continue;
    }

    try {
      await payload.update({
        collection: "master-card-list",
        id: card.id,
        data: { imageHighUrl, imageLowUrl },
        overrideAccess: true,
      });
    } catch (e) {
      console.warn(`  Update failed for ${card.externalId}:`, e);
      errors++;
      continue;
    }

    updated++;
  }

  console.log("");
  console.log(`Done. Updated: ${updated}, skipped: ${skipped}, errors: ${errors}`);

  await payload.destroy();
  process.exit(0);
}

seedCardImages().catch((err) => {
  console.error(err);
  process.exit(1);
});
