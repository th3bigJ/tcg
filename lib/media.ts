const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const getMediaBaseURL = (): string | null => {
  const explicitBase =
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL;

  const hasPlaceholder =
    typeof explicitBase === "string" &&
    explicitBase.includes("your-public-media-domain-or-r2-dev-url");

  if (explicitBase && !hasPlaceholder) {
    return trimTrailingSlash(explicitBase);
  }

  return null;
};

export const resolveMediaURL = (value: string | null | undefined): string => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  const base = getMediaBaseURL();
  if (!base) return value;

  return `${base}/${value.replace(/^\/+/, "")}`;
};
