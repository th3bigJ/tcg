import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  clampGridColumnsDesktop,
  clampGridColumnsMobile,
  DEFAULT_GRID_PREFERENCES,
  type GridPreferences,
} from "@/lib/gridPreferences";

type PreferencesRow = {
  grid_columns_mobile: number | null;
  grid_columns_desktop: number | null;
};

export async function fetchCustomerGridPreferences(customerId: string): Promise<GridPreferences> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_preferences")
    .select("grid_columns_mobile, grid_columns_desktop")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error || !data) {
    return { ...DEFAULT_GRID_PREFERENCES };
  }

  const row = data as PreferencesRow;
  return {
    gridColumnsMobile: clampGridColumnsMobile(
      row.grid_columns_mobile ?? DEFAULT_GRID_PREFERENCES.gridColumnsMobile,
    ),
    gridColumnsDesktop: clampGridColumnsDesktop(
      row.grid_columns_desktop ?? DEFAULT_GRID_PREFERENCES.gridColumnsDesktop,
    ),
  };
}
