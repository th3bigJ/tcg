import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { computePortfolioSnapshotPoint } from "@/lib/portfolioSnapshotCompute";
import {
  fetchPortfolioSnapshotDocumentForServer,
  mergeAndUploadPortfolioSnapshot,
} from "@/lib/r2PortfolioSnapshots";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

function missingR2Config(): boolean {
  return (
    !process.env.R2_BUCKET ||
    !process.env.R2_ENDPOINT ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  );
}

function canReadPortfolioSnapshots(): boolean {
  const hasPublic = !!(
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL
  );
  return hasPublic || !missingR2Config();
}

/** Returns stored portfolio history for the signed-in customer (public URL and/or R2 GetObject). */
export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  if (!canReadPortfolioSnapshots()) {
    return jsonResponseWithAuthCookies(
      {
        error:
          "Portfolio snapshots are not configured: set a public R2 base URL or R2 bucket credentials (same as uploads).",
      },
      authCookieResponse,
      { status: 503 },
    );
  }

  const doc = await fetchPortfolioSnapshotDocumentForServer(customer.id);
  return jsonResponseWithAuthCookies({ doc }, authCookieResponse);
}

/** Computes today’s snapshot (UTC date) and upserts it into R2. Re-running the same day overwrites that day. */
export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  if (missingR2Config()) {
    return jsonResponseWithAuthCookies(
      {
        error:
          "Portfolio snapshots require R2_BUCKET, R2_ENDPOINT, and R2 credentials. Add a public base URL if merge should read existing JSON over HTTP.",
      },
      authCookieResponse,
      { status: 503 },
    );
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  try {
    const point = await computePortfolioSnapshotPoint(supabase, customer.id);
    const doc = await mergeAndUploadPortfolioSnapshot(customer.id, point);
    return jsonResponseWithAuthCookies({ ok: true, point, doc }, authCookieResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Snapshot failed";
    return jsonResponseWithAuthCookies({ error: message }, authCookieResponse, { status: 500 });
  }
}
