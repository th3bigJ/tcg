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

/** Prefix inside R2_BUCKET for National Dex sprites (was a separate "pokemon" bucket). Default `pokemon`. */
const DEFAULT_POKEMON_MEDIA_PREFIX = "pokemon";

function normalizePokemonPrefix(raw: string | undefined): string {
  const p = (raw ?? DEFAULT_POKEMON_MEDIA_PREFIX).trim().replace(/^\/+|\/+$/g, "");
  return p;
}

/** Avoid `pokemon/pokemon/...` if stored paths were already prefixed during migration. */
function pokemonObjectKey(relativePath: string, prefix: string): string {
  const v = relativePath.replace(/^\/+/, "");
  if (!prefix) return v;
  if (v === prefix || v.startsWith(`${prefix}/`)) return v;
  return `${prefix}/${v}`;
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

  const base = getMediaBaseURL();
  if (!base) return value.startsWith("/") ? value : `/${value}`;

  return `${base}/${value.replace(/^\/+/, "")}`;
};

/**
 * Dex / Pokémon search thumbnails: same R2 public host as {@link resolveMediaURL}, under
 * `R2_POKEMON_MEDIA_PREFIX` (default `pokemon`). Copy former standalone-bucket keys into
 * `tcg` bucket as `{prefix}/{filename}` (e.g. `pokemon/1-1.png`).
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
