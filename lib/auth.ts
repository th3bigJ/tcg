import type { User } from "@supabase/supabase-js";
import config from "@payload-config";
import { getPayload } from "payload";
import { type NextRequest, NextResponse } from "next/server";

import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StorefrontCustomer = {
  /** Payload `customers` document id (use for `customer` relationships). */
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

/** Load or create the Payload `customers` row for a Supabase `auth.users` record. */
export async function loadOrCreateStorefrontCustomer(user: User): Promise<StorefrontCustomer | null> {
  const email = typeof user.email === "string" ? user.email.trim() : "";
  if (!email) return null;

  const payload = await getPayload({ config });

  const existing = await payload.find({
    collection: "customers",
    where: { supabaseUserId: { equals: user.id } },
    limit: 1,
    overrideAccess: true,
  });

  const meta =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : {};

  if (existing.docs[0]) {
    const doc = existing.docs[0] as {
      id: string | number;
      email?: string;
      firstName?: string;
      lastName?: string;
    };
    return {
      id: typeof doc.id === "number" ? String(doc.id) : doc.id,
      supabaseUserId: user.id,
      email: doc.email ?? email,
      firstName: typeof doc.firstName === "string" ? doc.firstName : "",
      lastName: typeof doc.lastName === "string" ? doc.lastName : "",
    };
  }

  const firstName =
    readMetadataString(meta, "first_name", "firstName") || "Customer";
  const lastName = readMetadataString(meta, "last_name", "lastName") || "User";

  const created = (await payload.create({
    collection: "customers",
    data: {
      supabaseUserId: user.id,
      email,
      firstName,
      lastName,
    },
    overrideAccess: true,
  })) as {
    id: string | number;
    email?: string;
    firstName?: string;
    lastName?: string;
  };

  return {
    id: typeof created.id === "number" ? String(created.id) : created.id,
    supabaseUserId: user.id,
    email: typeof created.email === "string" ? created.email : email,
    firstName: typeof created.firstName === "string" ? created.firstName : firstName,
    lastName: typeof created.lastName === "string" ? created.lastName : lastName,
  };
}

/**
 * Resolves the logged-in Supabase user to a Payload `customers` row.
 * If the user is authenticated in Supabase but has no Payload row yet, creates one
 * (signup metadata / email) using the Local API with `overrideAccess`.
 */
export async function getCurrentCustomer(): Promise<StorefrontCustomer | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return loadOrCreateStorefrontCustomer(user);
}

/**
 * For Route Handlers: validates Supabase session with cookie refresh support, then loads the Payload customer.
 * Always merge `authCookieResponse` onto your `NextResponse` (see `mergeSupabaseAuthCookies`).
 */
export async function getCurrentCustomerForApiRoute(request: NextRequest): Promise<{
  customer: StorefrontCustomer | null;
  authCookieResponse: NextResponse;
}> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return {
      customer: null,
      authCookieResponse: NextResponse.next({ request }),
    };
  }

  const { supabase, getAuthCookieResponse } = createSupabaseRouteHandlerClient(request);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const authCookieResponse = getAuthCookieResponse();

  if (error || !user) {
    return { customer: null, authCookieResponse };
  }

  const customer = await loadOrCreateStorefrontCustomer(user);
  return { customer, authCookieResponse };
}
