import nextEnvImport from "@next/env";
import { mergeIncompleteSetCodes } from "../lib/cardImportStatus";

export default async function refreshCardImportStatus() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const sets = await payload.find({
    collection: "sets",
    limit: 1000,
    depth: 0,
    select: { code: true, tcgdexId: true, name: true },
    overrideAccess: true,
  });

  const codeRows = sets.docs
    .map((row) => {
      const r = row as { code?: string | null; tcgdexId?: string | null; name?: string | null };
      return {
        code: (r.code || r.tcgdexId || "").trim(),
        name: (r.name || "").trim(),
      };
    })
    .filter((r) => Boolean(r.code));

  await mergeIncompleteSetCodes(codeRows);
  await payload.destroy();
  console.log(`Refreshed card import status with ${codeRows.length} set codes.`);
}

refreshCardImportStatus().catch((err) => {
  console.error(err);
  process.exit(1);
});
