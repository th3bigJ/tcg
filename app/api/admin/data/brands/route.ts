import { type NextRequest } from "next/server";
import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getJsonFromR2 } from "@/lib/adminR2";
import { R2_BRANDS_DATA } from "@/lib/r2BucketLayout";

type BrandEntry = {
  id: string;
  name: string;
  logo?: { r2ObjectKey?: string };
};

type BrandsFile = {
  schemaVersion: number;
  brands: BrandEntry[];
};

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const data = await getJsonFromR2<BrandsFile>(`${R2_BRANDS_DATA}/brands.json`);
  if (!data) {
    return jsonResponseWithAuthCookies({ error: "brands/data/brands.json not found in R2" }, authCookieResponse, { status: 404 });
  }

  return jsonResponseWithAuthCookies(data.brands, authCookieResponse);
}
