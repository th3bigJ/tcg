import TCGdex from "@tcgdex/sdk";
import nextEnvImport from "@next/env";

type TCGdexSetBrief = {
  id: string;
  name: string;
  cardCount?: {
    total?: number | null;
    official?: number | null;
  } | null;
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

export default async function seedSets() {
  // Ensure `.env.local` is loaded when running via `node` (outside Next's runtime).
  // Payload requires `PAYLOAD_SECRET` + `DATABASE_URI` at init time.
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const language = "en";
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;

  const tcgdex = new TCGdex(language);
  const payload = dryRun
    ? null
    : await (async () => {
        const payloadConfig = (await import("../payload.config")).default;
        const { getPayload } = await import("payload");
        return getPayload({ config: payloadConfig });
      })();

  const brands = dryRun
    ? null
    : await payload!.find({
        collection: "brands",
        limit: 1,
        select: { id: true },
      });

  const brandId = dryRun ? undefined : brands.docs[0]?.id;
  if (!dryRun && !brandId) {
    console.warn(
      "No Brands found in Payload. Create at least one Brand first, then re-run seedSets.",
    );
    process.exit(1);
  }

  const allSets = (await tcgdex.set.list()) as unknown as TCGdexSetBrief[];
  const totalSets = allSets.length;
  const toProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? Math.min(totalSets, limit)
      : totalSets;

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < toProcess; i++) {
    const tcgSet = allSets[i];

    const setId = tcgSet.id;
    const name = tcgSet.name;
    const slug = setId; // required + unique; using TCGdex id keeps it stable

    if (!dryRun) {
      const existing = await payload!.find({
        collection: "sets",
        where: { code: { equals: setId } },
        limit: 1,
        select: { id: true },
        overrideAccess: true,
      });

      if (existing.totalDocs > 0) {
        skipped++;
        continue;
      }

      await payload!.create({
        collection: "sets",
        data: {
          name,
          slug,
          code: setId,
          brand: brandId,
          cardCountTotal:
            typeof tcgSet.cardCount?.total === "number"
              ? tcgSet.cardCount.total
              : undefined,
          cardCountOfficial:
            typeof tcgSet.cardCount?.official === "number"
              ? tcgSet.cardCount.official
              : undefined,
        },
        overrideAccess: true,
      });
    }

    if (dryRun) {
      console.log("Dry run: would create Set with:", {
        name,
        slug,
        code: setId,
        cardCountTotal: tcgSet.cardCount?.total ?? null,
        cardCountOfficial: tcgSet.cardCount?.official ?? null,
      });
    } else {
      created++;
      console.log(`Created set ${i + 1} of ${toProcess}: ${name} (${setId})`);
    }
  }

  console.log("");
  console.log(`Seed sets complete (${dryRun ? "dry-run" : "write mode"})`);
  console.log(`Sets created: ${created}`);
  console.log(`Sets skipped: ${skipped}`);

  // Payload initialization keeps open connections; clean up so Node can exit.
  if (!dryRun) {
    await payload!.destroy();
    // Force exit in case Payload leaves open handles (HMR/db pools) in this runtime.
    process.exit(0);
  }
}

seedSets().catch((err) => {
  console.error(err);
  process.exit(1);
});

