/**
 * After `r2:download-static-data`, swsh9–swsh12 Trainer Gallery rows may lose
 * `externalId` while `card-pricing` still keys them as `{set}tg-tgNN` (lowercase).
 * Catalog uses `{set}tg-TGNN` (e.g. `swsh12tg-TG01`); we validate against the
 * lowercase pricing key then write the canonical uppercase `TG` suffix.
 *
 * Usage:
 *   node --import tsx/esm scripts/backfillSwshTrainerGalleryExternalIds.ts
 */

import fs from "fs";
import path from "path";

const DATA = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA, "cards");
const PRICING = path.join(DATA, "pricing", "card-pricing");

const SET_KEYS = ["swsh9", "swsh10", "swsh11", "swsh12"] as const;

const tgLocalId = /^TG\d+$/i;

function main(): void {
  let patched = 0;
  for (const setKey of SET_KEYS) {
    const cardsPath = path.join(CARDS_DIR, `${setKey}.json`);
    const pricingPath = path.join(PRICING, `${setKey}.json`);
    const cards = JSON.parse(fs.readFileSync(cardsPath, "utf-8")) as {
      externalId?: string | null;
      localId?: string | null;
      setCode?: string | null;
    }[];
    const cp = JSON.parse(fs.readFileSync(pricingPath, "utf-8")) as Record<string, unknown>;
    const cpKeys = new Set(Object.keys(cp));

    for (const row of cards) {
      const id = row.externalId;
      const empty = id == null || (typeof id === "string" && id.trim() === "");
      const lid = row.localId;
      if (!empty || typeof lid !== "string" || !tgLocalId.test(lid)) continue;

      const setCode = row.setCode ?? setKey;
      const pricingKey = `${setCode}tg-${lid.toLowerCase()}`;
      if (!cpKeys.has(pricingKey)) {
        console.warn(`${setKey}: no card-pricing key for ${pricingKey} (localId ${lid})`);
        continue;
      }
      row.externalId = `${setCode}tg-${lid}`;
      patched += 1;
    }

    fs.writeFileSync(cardsPath, `${JSON.stringify(cards, null, 4)}\n`, "utf-8");
  }
  console.log(`Patched ${patched} Trainer Gallery externalId fields.`);
}

main();
