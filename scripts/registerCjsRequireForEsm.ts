/**
 * Node ESM (e.g. `tsx scripts/snapshotPortfolio.ts`) has no `global.require`.
 * `lib/staticCards.ts` loads JSON via `require()` — resolve relative to that file.
 * Import this module first in any CLI script that pulls in static card data.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const staticCardsPath = fileURLToPath(new URL("../lib/staticCards.ts", import.meta.url));

if (typeof (globalThis as { require?: unknown }).require !== "function") {
  (globalThis as { require: ReturnType<typeof createRequire> }).require =
    createRequire(staticCardsPath);
}
