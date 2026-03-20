import nextEnvImport from "@next/env";

type SetDoc = {
  serieName?: string | number | { id?: string | number } | null;
};

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default async function syncSeriesFromSets() {
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
    select: {
      serieName: true,
    },
    overrideAccess: true,
  });

  const bySeriesName = new Map<string, { name: string; tcgdexSeriesId?: string }>();

  for (const rawDoc of sets.docs) {
    const doc = rawDoc as SetDoc;
    const name =
      typeof doc.serieName === "string"
        ? doc.serieName.trim()
        : "";
    if (!name) continue;

    const key = name.toLowerCase();
    const existing = bySeriesName.get(key);
    if (!existing) {
      bySeriesName.set(key, {
        name,
        tcgdexSeriesId: undefined,
      });
    }
  }

  let created = 0;
  let updated = 0;

  for (const { name, tcgdexSeriesId } of bySeriesName.values()) {
    const slug = slugify(name);
    const existing = await payload.find({
      collection: "series",
      where: {
        name: {
          equals: name,
        },
      },
      limit: 1,
      depth: 0,
      select: { id: true, tcgdexSeriesId: true, slug: true },
      overrideAccess: true,
    });

    if (existing.totalDocs > 0) {
      const current = existing.docs[0] as { id: string | number; tcgdexSeriesId?: string; slug?: string };
      const needsUpdate =
        (tcgdexSeriesId && current.tcgdexSeriesId !== tcgdexSeriesId) ||
        (!current.slug && slug);

      if (needsUpdate) {
        await payload.update({
          collection: "series",
          id: current.id,
          data: {
            tcgdexSeriesId: tcgdexSeriesId ?? current.tcgdexSeriesId,
            slug: current.slug || slug,
          },
          overrideAccess: true,
        });
        updated++;
      }
      continue;
    }

    await payload.create({
      collection: "series",
      data: {
        name,
        slug,
        tcgdexSeriesId,
        isActive: true,
      },
      overrideAccess: true,
    });
    created++;
  }

  console.log(`Series sync complete. Created: ${created}, Updated: ${updated}, Total unique series: ${bySeriesName.size}`);

  await payload.destroy();
}

syncSeriesFromSets().catch((err) => {
  console.error(err);
  process.exit(1);
});
