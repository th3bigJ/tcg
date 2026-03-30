import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getItemConditionName } from "@/lib/referenceData";
import {
  mapCustomerCollectionRow,
  mapCustomerWishlistRow,
  type StorefrontCardEntry,
} from "@/lib/storefrontCardMaps";

const PAGE_SIZE = 1000;

export async function fetchCollectionCardEntries(customerId: string): Promise<StorefrontCardEntry[]> {
  const supabase = await createSupabaseServerClient();
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("customer_collections")
      .select("id, master_card_id, quantity, printing, language, added_at, condition_id, graded_market_price, unlisted_price, grading_company, grade_value, graded_image, graded_serial")
      .eq("customer_id", customerId)
      .order("added_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data) break;
    for (const row of data) allRows.push(row as unknown as Record<string, unknown>);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows
    .map((row) => {
      const conditionName = getItemConditionName(row.condition_id as string | null);
      return mapCustomerCollectionRow(row, conditionName);
    })
    .filter((e): e is StorefrontCardEntry => Boolean(e));
}

export async function fetchWishlistCardEntries(customerId: string): Promise<StorefrontCardEntry[]> {
  const supabase = await createSupabaseServerClient();
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data } = await supabase
      .from("customer_wishlists")
      .select("id, master_card_id, priority, target_condition_id, target_printing, added_at")
      .eq("customer_id", customerId)
      .order("added_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (!data) break;
    for (const row of data) allRows.push(row as unknown as Record<string, unknown>);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows
    .map((row) => {
      const conditionName = getItemConditionName(row.target_condition_id as string | null);
      return mapCustomerWishlistRow(row, conditionName);
    })
    .filter((e): e is StorefrontCardEntry => Boolean(e));
}

export async function fetchWishlistIdsByMasterCard(
  customerId: string,
): Promise<Record<string, { id: string; printing?: string }>> {
  const supabase = await createSupabaseServerClient();
  const map: Record<string, { id: string; printing?: string }> = {};
  let from = 0;

  while (true) {
    const { data } = await supabase
      .from("customer_wishlists")
      .select("id, master_card_id, target_printing")
      .eq("customer_id", customerId)
      .range(from, from + PAGE_SIZE - 1);

    if (!data) break;
    for (const row of data) {
      const mid = row.master_card_id as string;
      const wid = row.id as string;
      if (mid && wid && map[mid] === undefined) {
        map[mid] = {
          id: wid,
          printing: typeof row.target_printing === "string" ? row.target_printing : undefined,
        };
      }
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return map;
}
