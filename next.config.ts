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
