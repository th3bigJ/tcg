import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { runScrapePricing } from "@/lib/jobs/jobScrapePricing";
import { createScraperSseResponse } from "@/lib/adminSseStream";

export async function POST(request: NextRequest) {
  const { customer } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    dryRun?: boolean;
    onlySetCodes?: string[];
    onlySeriesNames?: string[];
  };

  return createScraperSseResponse(async () => {
    await runScrapePricing({
      dryRun: body.dryRun ?? false,
      onlySetCodes: body.onlySetCodes,
      onlySeriesNames: body.onlySeriesNames,
    });
  });
}
