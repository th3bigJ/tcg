import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { runScrapeOnePieceCards } from "@/lib/jobs/jobScrapeOnePieceCards";
import { createScraperSseResponse } from "@/lib/adminSseStream";

export async function POST(request: NextRequest) {
  const { customer } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    dryRun?: boolean;
    noImages?: boolean;
    onlySetCodes?: string[];
  };

  return createScraperSseResponse(async (onLog) => {
    await runScrapeOnePieceCards(
      {
        dryRun: body.dryRun ?? false,
        noImages: body.noImages ?? false,
        onlySetCodes: body.onlySetCodes,
      },
      onLog,
    );
  });
}
