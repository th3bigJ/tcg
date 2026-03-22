import nextEnvImport from "@next/env";

/**
 * Creates the "Mega Evolution Energy" set (`mee`) if missing.
 * Matches `data/data/Mega Evolution/Mega Evolution Energy.ts` (TCGdex id `mee`).
 *
 * Usage: node --import tsx/esm scripts/seedMegaEvolutionEnergySet.ts
 */

export default async function seedMegaEvolutionEnergySet() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const existing = await payload.find({
    collection: "sets",
    where: {
      or: [{ tcgdexId: { equals: "mee" } }, { code: { equals: "mee" } }],
    },
    limit: 1,
    overrideAccess: true,
  });

  if (existing.totalDocs > 0) {
    const doc = existing.docs[0] as { id: unknown; name?: string; code?: string };
    console.log(
      `Already exists: id=${String(doc.id)} name=${doc.name ?? ""} code=${doc.code ?? ""}`,
    );
    process.exit(0);
  }

  const me1 = await payload.find({
    collection: "sets",
    where: { code: { equals: "me1" } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { brand: true },
  });
  const brandId =
    me1.docs[0] && typeof me1.docs[0] === "object" && "brand" in me1.docs[0]
      ? (me1.docs[0] as { brand: number | string | { id: number | string } }).brand
      : null;
  const resolvedBrand =
    typeof brandId === "object" && brandId && "id" in brandId
      ? brandId.id
      : brandId;
  if (resolvedBrand === null || resolvedBrand === undefined) {
    console.error("Could not resolve brand from set code me1. Create Mega Evolution set first.");
    process.exit(1);
  }

  const series = await payload.find({
    collection: "series",
    where: { name: { equals: "Mega Evolution" } },
    limit: 1,
    overrideAccess: true,
    select: { id: true },
  });
  const seriesId = series.docs[0]?.id;
  if (!seriesId) {
    console.error('Series "Mega Evolution" not found. Sync series first.');
    process.exit(1);
  }

  const created = await payload.create({
    collection: "sets",
    data: {
      name: "Mega Evolution Energy",
      slug: "mega-evolution-energy",
      code: "mee",
      tcgdexId: "mee",
      brand: resolvedBrand,
      serieName: seriesId,
      releaseDate: "2025-09-25T00:00:00.000Z",
      cardCountOfficial: 8,
      isActive: true,
    },
    overrideAccess: true,
  });

  console.log(`Created set id=${String(created.id)} code=mee name=Mega Evolution Energy`);
}

seedMegaEvolutionEnergySet().catch((err) => {
  console.error(err);
  process.exit(1);
});
