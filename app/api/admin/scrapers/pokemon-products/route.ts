import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { runScrapePokedataProducts } from "@/lib/jobs/jobScrapePokedataProducts";
import { createScraperSseResponse } from "@/lib/adminSseStream";

export async function POST(request: NextRequest) {
  const { customer } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    mode?: "all" | "products" | "prices";
    dryRun?: boolean;
  };

  return createScraperSseResponse(async () => {
    await runScrapePokedataProducts({
      mode: body.mode ?? "all",
    });
  });
}
