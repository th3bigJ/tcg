import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";

type RelId = number | string;

type LocalSet = {
  id: string;
  name?: string;
  images?: {
    symbol?: string;
    logo?: string;
  };
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const getMimeFromContentType = (contentType: string | null): string | undefined => {
  if (!contentType) return undefined;
  const [mime] = contentType.split(";").map((s) => s.trim());
  return mime || undefined;
};

const extFromMime = (mime: string): string => {
  if (mime === "image/webp") return "webp";
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/gif") return "gif";
  return "bin";
};

const fetchImageBuffer = async (url: string) => {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const mime = getMimeFromContentType(res.headers.get("content-type"));
  if (!mime || !mime.startsWith("image/")) {
    throw new Error(`Invalid image mime ${mime ?? "unknown"} for ${url}`);
  }
  const arr = await res.arrayBuffer();
  return { buffer: Buffer.from(arr), mime, ext: extFromMime(mime) };
};

const bytesToFile = (buffer: Buffer, mimetype: string, name: string) => ({
  data: buffer,
  mimetype,
  name,
  size: buffer.byteLength,
});

export default async function refreshSetAssetsFromLocalJson() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const dryRun = process.argv.includes("--dry-run");
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const setArg = getArg("set");

  const payload = dryRun
    ? null
    : await (async () => {
        const payloadConfig = (await import("../payload.config")).default;
        const { getPayload } = await import("payload");
        return getPayload({ config: payloadConfig });
      })();

  const localPath = path.resolve(process.cwd(), "data/sets/en.json");
  const localSetsRaw = JSON.parse(await fs.readFile(localPath, "utf8")) as LocalSet[];
  const byId = new Map(localSetsRaw.map((s) => [s.id, s]));

  const setsResult = dryRun
    ? { docs: [] as Array<Record<string, unknown>>, totalDocs: 0 }
    : await payload!.find({
        collection: "sets",
        limit: 1000,
        depth: 0,
        select: { id: true, name: true, code: true, symbolImage: true, setImage: true },
        overrideAccess: true,
      });

  const rows = setArg
    ? setsResult.docs.filter((d) => String((d as { code?: string | null }).code || "") === setArg)
    : setsResult.docs;
  const toProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? rows.slice(0, limit)
      : rows;

  let logoCreated = 0;
  let symbolCreated = 0;
  let setsUpdated = 0;
  let setsSkipped = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const setRow = toProcess[i] as {
      id: RelId;
      name?: string;
      code?: string | null;
      symbolImage?: RelId | { id?: RelId } | null;
      setImage?: RelId | { id?: RelId } | null;
    };
    const code = String(setRow.code || "").trim();
    const local = byId.get(code);
    if (!local) {
      setsSkipped++;
      continue;
    }

    const hasSymbol = setRow.symbolImage != null;
    const hasLogo = setRow.setImage != null;
    const setName = setRow.name || local.name || code;

    let symbolMediaId: RelId | null = null;
    if (!hasSymbol && local.images?.symbol) {
      if (dryRun) {
        symbolMediaId = "dry-run";
      } else {
        const { buffer, mime, ext } = await fetchImageBuffer(local.images.symbol);
        const symbolDoc = await payload!.create({
          collection: "set-symbol-media",
          data: { alt: `${setName} symbol` },
          file: bytesToFile(buffer, mime, `${code}-symbol.${ext}`),
          overrideAccess: true,
        });
        symbolMediaId = symbolDoc.id ?? null;
        symbolCreated++;
      }
    }

    let logoMediaId: RelId | null = null;
    if (!hasLogo && local.images?.logo) {
      if (dryRun) {
        logoMediaId = "dry-run";
      } else {
        const { buffer, mime, ext } = await fetchImageBuffer(local.images.logo);
        const logoDoc = await payload!.create({
          collection: "set-logo-media",
          data: { alt: `${setName} logo` },
          file: bytesToFile(buffer, mime, `${code}-logo.${ext}`),
          overrideAccess: true,
        });
        logoMediaId = logoDoc.id ?? null;
        logoCreated++;
      }
    }

    if (!dryRun && (symbolMediaId || logoMediaId)) {
      await payload!.update({
        collection: "sets",
        id: setRow.id,
        data: {
          ...(symbolMediaId ? { symbolImage: symbolMediaId } : {}),
          ...(logoMediaId ? { setImage: logoMediaId } : {}),
        },
        overrideAccess: true,
      });
      setsUpdated++;
    }
  }

  console.log("");
  console.log(`Refresh set assets from local JSON complete (${dryRun ? "dry-run" : "write mode"})`);
  console.log(`Logo created: ${logoCreated}`);
  console.log(`Symbol created: ${symbolCreated}`);
  console.log(`Sets updated: ${setsUpdated}`);
  console.log(`Sets skipped: ${setsSkipped}`);

  if (!dryRun && payload) {
    await payload.destroy();
    process.exit(0);
  }
}

refreshSetAssetsFromLocalJson().catch((err) => {
  console.error(err);
  process.exit(1);
});
