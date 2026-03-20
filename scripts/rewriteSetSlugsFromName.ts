import nextEnvImport from "@next/env";
import { slugify } from "../lib/slugs";

type SetDoc = {
  id: number | string;
  name?: string | null;
  slug?: string | null;
};

export default async function rewriteSetSlugsFromName() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const dryRun = process.argv.includes("--dry-run");
  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const sets = await payload.find({
    collection: "sets",
    limit: 5000,
    depth: 0,
    select: {
      id: true,
      name: true,
      slug: true,
    },
    overrideAccess: true,
  });

  const used = new Set<string>();
  const updates: Array<{ id: number | string; from: string; to: string }> = [];

  const sorted = [...(sets.docs as SetDoc[])].sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? "")),
  );

  for (const row of sorted) {
    const name = (row.name ?? "").trim();
    if (!name) continue;

    const base = slugify(name);
    if (!base) continue;

    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix++;
    }
    used.add(candidate);

    const current = (row.slug ?? "").trim();
    if (current !== candidate) {
      updates.push({ id: row.id, from: current, to: candidate });
    }
  }

  if (dryRun) {
    console.log(`Dry run: ${updates.length} set slug updates needed.`);
    updates.slice(0, 25).forEach((u) => {
      console.log(`- ${u.id}: "${u.from}" -> "${u.to}"`);
    });
    await payload.destroy();
    return;
  }

  let updated = 0;
  for (const change of updates) {
    await payload.update({
      collection: "sets",
      id: change.id,
      data: {
        slug: change.to,
      },
      overrideAccess: true,
    });
    updated++;
  }

  console.log(`Set slug rewrite complete. Updated: ${updated}`);
  await payload.destroy();
}

rewriteSetSlugsFromName().catch((err) => {
  console.error(err);
  process.exit(1);
});
