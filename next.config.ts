import type { NextConfig } from "next";

const getHostname = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

const r2Hostname =
  getHostname(process.env.R2_PUBLIC_BASE_URL) ||
  getHostname(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) ||
  getHostname(process.env.NEXT_PUBLIC_MEDIA_BASE_URL) ||
  getHostname(process.env.R2_ENDPOINT);

/** Hosts used by Pokémon singles JSON (official API mirror, Limitless CDN, seeded set marks) — required for `next/image` even when R2 env is unset (local dev). */
const POKEMON_CARD_IMAGE_HOSTS = [
  "images.pokemontcg.io",
  "limitlesstcg.nyc3.cdn.digitaloceanspaces.com",
  "s3.limitlesstcg.com",
] as const;

const imageRemoteHostnames = new Set<string>([...POKEMON_CARD_IMAGE_HOSTS]);
if (r2Hostname) imageRemoteHostnames.add(r2Hostname);

const imageRemotePatterns = [...imageRemoteHostnames].map((hostname) => ({
  protocol: "https" as const,
  hostname,
}));

const extraAllowedDevOrigins =
  process.env.NEXT_EXTRA_ALLOWED_DEV_ORIGINS?.split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Allow both hostnames — dev blocks cross-origin fetches; localhost ≠ 127.0.0.1 as an origin.
  allowedDevOrigins: ["127.0.0.1", "localhost", ...extraAllowedDevOrigins],
  transpilePackages: ["@supabase/ssr", "@supabase/supabase-js"],
  images: {
    // Only generate WebP — AVIF is slower to encode with marginal gains for card images
    formats: ["image/webp"],
    // Tuned breakpoints for card grid tiles (~150px) and modal (~480px)
    imageSizes: [96, 128, 160, 256, 384, 480],
    deviceSizes: [640, 750, 828, 1080, 1200],
    remotePatterns: imageRemotePatterns,
  },
};

export default nextConfig;
