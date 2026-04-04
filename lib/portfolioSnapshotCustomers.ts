import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE = 1000;

/** All `customers.id` values (stringified), ordered ascending — for batch snapshot jobs. */
export async function fetchAllCustomerIds(supabase: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      if (row.id != null) ids.push(String(row.id));
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return ids;
}
