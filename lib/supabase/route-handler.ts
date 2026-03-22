import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Supabase client for App Router **Route Handlers** only.
 * `cookies()` from `next/headers` does not reliably persist refreshed auth cookies on
 * `Response.json()` — that can log users out after POST /api/*.
 * This mirrors the middleware pattern: mutate a `NextResponse` and merge cookies onto the final response.
 */
export function createSupabaseRouteHandlerClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY for Supabase.",
    );
  }

  let authCookieResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        authCookieResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          authCookieResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  return {
    supabase,
    getAuthCookieResponse: () => authCookieResponse,
  };
}

/** Copy Set-Cookie headers from the auth helper response onto your JSON (or other) response. */
export function mergeSupabaseAuthCookies(target: NextResponse, authCookieSource: NextResponse) {
  authCookieSource.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

export function jsonResponseWithAuthCookies(
  body: unknown,
  authCookieSource: NextResponse,
  init?: { status?: number },
) {
  const res = NextResponse.json(body, init);
  return mergeSupabaseAuthCookies(res, authCookieSource);
}
