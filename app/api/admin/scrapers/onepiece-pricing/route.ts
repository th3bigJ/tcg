import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { runScrapeOnePiecePricing } from "@/lib/jobs/jobScrapeOnePiecePricing";
import { createScraperSseResponse } from "@/lib/adminSseStream";

export async function POST(request: NextRequest) {
  const { customer } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    dryRun?: boolean;
    onlySetCodes?: string[];
    source?: "local" | "r2";
  };

  return createScraperSseResponse(async () => {
    await runScrapeOnePiecePricing({
      dryRun: body.dryRun ?? false,
      onlySetCodes: body.onlySetCodes,
      source: body.source ?? "r2",
    });
  });
}
