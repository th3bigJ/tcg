import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import {
  GRID_PREFERENCES_LOCAL_STORAGE_KEY,
  normalizeGridPreferences,
  type GridPreferences,
} from "@/lib/gridPreferences";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("customer_preferences")
    .select("grid_columns_mobile, grid_columns_desktop")
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 500 });
  }

  const prefs: GridPreferences = normalizeGridPreferences(
    data
      ? {
          gridColumnsMobile: data.grid_columns_mobile as number,
          gridColumnsDesktop: data.grid_columns_desktop as number,
        }
      : null,
  );

  return jsonResponseWithAuthCookies({ preferences: prefs }, authCookieResponse);
}

type PatchBody = {
  gridColumnsMobile?: unknown;
  gridColumnsDesktop?: unknown;
};

export async function PATCH(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const { data: existing } = await supabase
    .from("customer_preferences")
    .select("grid_columns_mobile, grid_columns_desktop")
    .eq("customer_id", customer.id)
    .maybeSingle();

  const base = normalizeGridPreferences(
    existing
      ? {
          gridColumnsMobile: existing.grid_columns_mobile as number,
          gridColumnsDesktop: existing.grid_columns_desktop as number,
        }
      : null,
  );

  const next = normalizeGridPreferences({
    gridColumnsMobile:
      typeof body.gridColumnsMobile === "number" ? body.gridColumnsMobile : base.gridColumnsMobile,
    gridColumnsDesktop:
      typeof body.gridColumnsDesktop === "number" ? body.gridColumnsDesktop : base.gridColumnsDesktop,
  });

  const { error } = await supabase.from("customer_preferences").upsert(
    {
      customer_id: customer.id,
      grid_columns_mobile: next.gridColumnsMobile,
      grid_columns_desktop: next.gridColumnsDesktop,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "customer_id" },
  );

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 500 });
  }

  return jsonResponseWithAuthCookies(
    {
      preferences: next,
      /** Hint for clients that mirror to localStorage */
      localStorageKey: GRID_PREFERENCES_LOCAL_STORAGE_KEY,
    },
    authCookieResponse,
  );
}
