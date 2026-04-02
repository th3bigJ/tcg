import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { variantStorageCandidates } from "@/lib/cardVariantLabels";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { getItemConditionName } from "@/lib/referenceData";

function revalidateWishlistSurfaces() {
  revalidatePath("/wishlist");
  revalidatePath("/search");
  revalidatePath("/expansions");
}

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data, error } = await supabase
    .from("customer_wishlists")
    .select("id, master_card_id, target_condition_id, target_printing, max_price, priority, notes, added_at")
    .eq("customer_id", customer.id)
    .order("added_at", { ascending: false })
    .limit(2000);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 500 });
  }

  const docs = (data ?? []).map((row) => ({
    ...row,
    target_condition_name: getItemConditionName(row.target_condition_id as string | null),
  }));

  return jsonResponseWithAuthCookies({ docs }, authCookieResponse);
}

type WishlistPostBody = {
  masterCardId?: string;
  targetConditionId?: string | null;
  targetPrinting?: string | null;
  maxPrice?: number | null;
  priority?: "low" | "medium" | "high" | null;
};

export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  let body: WishlistPostBody;
  try {
    body = (await request.json()) as WishlistPostBody;
  } catch {
    return jsonResponseWithAuthCookies({ error: "Invalid JSON" }, authCookieResponse, { status: 400 });
  }

  const masterCardId = typeof body.masterCardId === "string" ? body.masterCardId.trim() : "";
  if (!masterCardId) {
    return jsonResponseWithAuthCookies({ error: "masterCardId is required" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const priority =
    body.priority === "low" || body.priority === "high" || body.priority === "medium"
      ? body.priority
      : "medium";
  const targetConditionId =
    typeof body.targetConditionId === "string" && body.targetConditionId.trim()
      ? body.targetConditionId.trim()
      : null;
  const maxPrice =
    typeof body.maxPrice === "number" && Number.isFinite(body.maxPrice) && body.maxPrice >= 0
      ? body.maxPrice
      : null;
  const rawTargetPrinting =
    typeof body.targetPrinting === "string" && body.targetPrinting.trim() ? body.targetPrinting.trim() : null;
  const targetPrintingCandidates = variantStorageCandidates(body.targetPrinting).filter((candidate) =>
    rawTargetPrinting ? candidate !== null : true,
  );

  // Keep a single wishlist row per card, but allow the desired variant/details to change.
  const { data: existing } = await supabase
    .from("customer_wishlists")
    .select("id, master_card_id, priority, target_printing")
    .eq("customer_id", customer.id)
    .eq("master_card_id", masterCardId)
    .maybeSingle();

  if (existing) {
    let updatedDoc: Record<string, unknown> | null = null;
    let lastError: { message?: string } | null = null;

    for (const candidate of targetPrintingCandidates) {
      const { data: updated, error } = await supabase
        .from("customer_wishlists")
        .update({
          priority,
          target_condition_id: targetConditionId,
          target_printing: candidate,
          max_price: maxPrice,
        })
        .eq("id", existing.id)
        .eq("customer_id", customer.id)
        .select()
        .single();

      if (!error && updated) {
        updatedDoc = updated as Record<string, unknown>;
        break;
      }

      lastError = error;
    }

    if (!updatedDoc) {
      return jsonResponseWithAuthCookies(
        {
          error:
            lastError?.message ??
            (rawTargetPrinting
              ? `Unable to save wishlist variant "${rawTargetPrinting}"`
              : "Unable to update wishlist variant"),
        },
        authCookieResponse,
        { status: 422 },
      );
    }

    revalidateWishlistSurfaces();
    return jsonResponseWithAuthCookies({ doc: updatedDoc, existing: true }, authCookieResponse);
  }

  let createdDoc: Record<string, unknown> | null = null;
  let lastError: { message?: string } | null = null;

  for (const candidate of targetPrintingCandidates) {
    const { data: created, error } = await supabase
      .from("customer_wishlists")
      .insert({
        customer_id: customer.id,
        master_card_id: masterCardId,
        priority,
        target_condition_id: targetConditionId,
        target_printing: candidate,
        max_price: maxPrice,
      })
      .select()
      .single();

    if (!error && created) {
      createdDoc = created as Record<string, unknown>;
      break;
    }

    lastError = error;
  }

  if (!createdDoc) {
    return jsonResponseWithAuthCookies(
      {
        error:
          lastError?.message ??
          (rawTargetPrinting
            ? `Unable to save wishlist variant "${rawTargetPrinting}"`
            : "Unable to create wishlist entry"),
      },
      authCookieResponse,
      { status: 422 },
    );
  }

  revalidateWishlistSurfaces();
  return jsonResponseWithAuthCookies({ doc: createdDoc, existing: false }, authCookieResponse);
}

export async function DELETE(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return jsonResponseWithAuthCookies({ error: "id query parameter is required" }, authCookieResponse, { status: 400 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { error } = await supabase
    .from("customer_wishlists")
    .delete()
    .eq("id", id)
    .eq("customer_id", customer.id);

  if (error) {
    return jsonResponseWithAuthCookies({ error: error.message }, authCookieResponse, { status: 422 });
  }

  revalidateWishlistSurfaces();
  return jsonResponseWithAuthCookies({ ok: true }, authCookieResponse);
}
