import type { User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { linkPendingProfileSharesForCustomer } from "@/lib/customerProfileSharesServer";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StorefrontCustomer = {
  id: string;
  supabaseUserId: string;
  email: string;
  firstName: string;
  lastName: string;
};

function readMetadataString(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Load or create the Supabase `customers` row for a Supabase `auth.users` record. */
export async function loadOrCreateStorefrontCustomer(user: User): Promise<StorefrontCustomer | null> {
  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (!email) return null;

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("customers")
    .select("id, email, first_name, last_name")
    .eq("supabase_user_id", user.id)
    .single();

  if (existing) {
    await linkPendingProfileSharesForCustomer(
      supabase,
      String(existing.id),
      (existing.email as string) ?? email,
    );
    return {
      id: existing.id as string,
      supabaseUserId: user.id,
      email: (existing.email as string) ?? email,
      firstName: (existing.first_name as string) ?? "",
      lastName: (existing.last_name as string) ?? "",
    };
  }

  const meta =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : {};
  const firstName = readMetadataString(meta, "first_name", "firstName") || "Customer";
  const lastName = readMetadataString(meta, "last_name", "lastName") || "User";

  const { data: created, error } = await supabase
    .from("customers")
    .insert({ supabase_user_id: user.id, email, first_name: firstName, last_name: lastName })
    .select("id, email, first_name, last_name")
    .single();

  if (error || !created) return null;

  await linkPendingProfileSharesForCustomer(supabase, String(created.id), (created.email as string) ?? email);

  return {
    id: created.id as string,
    supabaseUserId: user.id,
    email: (created.email as string) ?? email,
    firstName: (created.first_name as string) ?? firstName,
    lastName: (created.last_name as string) ?? lastName,
  };
}

/**
 * Resolves the logged-in Supabase user to a `customers` row.
 * Creates the row automatically on first login.
 */
export async function getCurrentCustomer(): Promise<StorefrontCustomer | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;
  return loadOrCreateStorefrontCustomer(user);
}

/**
 * For Route Handlers: validates Supabase session with cookie refresh support, then loads the customer.
 * Always merge `authCookieResponse` onto your `NextResponse`.
 */
export async function getCurrentCustomerForApiRoute(request: NextRequest): Promise<{
  customer: StorefrontCustomer | null;
  authCookieResponse: NextResponse;
}> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { customer: null, authCookieResponse: NextResponse.next({ request }) };
  }

  const { supabase, getAuthCookieResponse } = createSupabaseRouteHandlerClient(request);
  const { data: { user }, error } = await supabase.auth.getUser();

  const authCookieResponse = getAuthCookieResponse();

  if (error || !user) {
    return { customer: null, authCookieResponse };
  }

  const customer = await loadOrCreateStorefrontCustomer(user);
  return { customer, authCookieResponse };
}
