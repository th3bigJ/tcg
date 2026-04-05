import { r2GradedImagesPrefix, r2PokemonMediaPrefixDefault } from "@/lib/r2BucketLayout";

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const getFirstValidBaseURL = (candidates: Array<string | undefined>): string | null => {
  const explicitBase = candidates.find((value) => Boolean(value));

  const hasPlaceholder =
    typeof explicitBase === "string" &&
    explicitBase.includes("your-public-media-domain-or-r2-dev-url");

  if (explicitBase && !hasPlaceholder) {
    return trimTrailingSlash(explicitBase);
  }

  return null;
};

const getMediaBaseURL = (): string | null =>
  getFirstValidBaseURL([
    process.env.R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
  ]);

function normalizePokemonPrefix(raw: string | undefined): string {
  const p = (raw ?? r2PokemonMediaPrefixDefault).trim().replace(/^\/+|\/+$/g, "");
  return p;
}

/** Avoid duplicated segments when prefix or stored paths already include `pokemon/`. */
function pokemonObjectKey(relativePath: string, prefix: string): string {
  let v = relativePath.replace(/^\/+/, "");
  if (!prefix) return v;
  if (prefix === "images/pokemon" || prefix.endsWith("/pokemon")) {
    if (v === "pokemon" || v.startsWith("pokemon/")) {
      v = v === "pokemon" ? "" : v.slice("pokemon/".length);
    }
  }
  if (!prefix) return v;
  if (v === prefix || v.startsWith(`${prefix}/`)) return v;
  return v ? `${prefix}/${v}` : prefix;
}

/** Legacy R2 keys before `images/pokemon` and `images/graded_images` layout. */
function normalizeLegacyR2RelativePath(value: string): string {
  const v = value.replace(/^\/+/, "");
  if (v.startsWith("images/")) return v;
  if (v.startsWith("graded-images/")) {
    return `${r2GradedImagesPrefix}/${v.slice("graded-images/".length)}`;
  }
  if (v.startsWith("sets/")) {
    return `images/sets/${v.slice("sets/".length)}`;
  }
  return v;
}

const sanitizeAbsoluteMediaURL = (value: string): string => {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();

    // Dev-seeded absolute URLs can leak into production records.
    // Convert localhost URLs to root-relative so they resolve on the current host.
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    // Avoid mixed-content failures on HTTPS deployments.
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
      return parsed.toString();
    }
  } catch {
    // If URL parsing fails, fall back to original value.
  }

  return value;
};

export const resolveMediaURL = (value: string | null | undefined): string => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return sanitizeAbsoluteMediaURL(value);

  const path = normalizeLegacyR2RelativePath(value);
  const base = getMediaBaseURL();
  if (!base) return path.startsWith("/") ? path : `/${path}`;

  return `${base}/${path.replace(/^\/+/, "")}`;
};

/**
 * Dex / Pokémon search thumbnails: same R2 public host as {@link resolveMediaURL}, under
 * `R2_POKEMON_MEDIA_PREFIX` (default {@link r2PokemonMediaPrefixDefault}).
 */
export const resolvePokemonMediaURL = (value: string | null | undefined): string => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return sanitizeAbsoluteMediaURL(value);

  const base = getMediaBaseURL();
  const prefix = normalizePokemonPrefix(process.env.R2_POKEMON_MEDIA_PREFIX);
  const key = pokemonObjectKey(value, prefix);
  if (!base) return key.startsWith("/") ? key : `/${key}`;

  return `${base}/${key.replace(/^\/+/, "")}`;
};
