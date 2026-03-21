import type { NextConfig } from "next";

import { withPayload } from "@payloadcms/next/withPayload";

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

const nextConfig: NextConfig = {
  // Allow 127.0.0.1 as a dev origin. Next.js allows localhost by default, but
  // 127.0.0.1 is a different hostname. Without this, accessing via 127.0.0.1:3000
  // triggers "access control checks" on RSC fetches, HMR, and source maps.
  allowedDevOrigins: ["127.0.0.1"],
  images: r2Hostname
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: r2Hostname,
          },
        ],
      }
    : undefined,
};

export default withPayload(nextConfig);
