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

const getPokemonMediaBaseURL = (): string | null =>
  getFirstValidBaseURL([
    process.env.R2_POKEMON_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_R2_POKEMON_PUBLIC_BASE_URL,
    process.env.R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
  ]);

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

export const resolvePokemonMediaURL = (value: string | null | undefined): string => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return sanitizeAbsoluteMediaURL(value);

  const base = getPokemonMediaBaseURL();
  if (!base) return value.startsWith("/") ? value : `/${value}`;

  return `${base}/${value.replace(/^\/+/, "")}`;
};
