import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { runScrapeOnePieceSets } from "@/lib/jobs/jobScrapeOnePieceSets";
import { createScraperSseResponse } from "@/lib/adminSseStream";

export async function POST(request: NextRequest) {
  const { customer } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { dryRun?: boolean };

  return createScraperSseResponse(async (onLog) => {
    await runScrapeOnePieceSets({ dryRun: body.dryRun ?? false }, onLog);
  });
}
