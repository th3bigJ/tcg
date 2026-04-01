/** Breakpoint-style grid density: narrow viewport vs md+ (see `.card-grid-columns-dynamic` in globals.css). */

export type GridPreferences = {
  gridColumnsMobile: number;
  gridColumnsDesktop: number;
};

export const GRID_COLUMNS_MOBILE_MIN = 1;
export const GRID_COLUMNS_MOBILE_MAX = 4;
export const GRID_COLUMNS_DESKTOP_MIN = 3;
export const GRID_COLUMNS_DESKTOP_MAX = 10;

/** When no row exists in `customer_preferences` (or values are missing), the app uses these. */
export const DEFAULT_GRID_COLUMNS_MOBILE = 3;
export const DEFAULT_GRID_COLUMNS_DESKTOP = 7;

export const DEFAULT_GRID_PREFERENCES: GridPreferences = {
  gridColumnsMobile: DEFAULT_GRID_COLUMNS_MOBILE,
  gridColumnsDesktop: DEFAULT_GRID_COLUMNS_DESKTOP,
};

export const GRID_PREFERENCES_LOCAL_STORAGE_KEY = "tcg:grid-preferences";

export function clampGridColumnsMobile(n: number): number {
  return Math.min(
    GRID_COLUMNS_MOBILE_MAX,
    Math.max(GRID_COLUMNS_MOBILE_MIN, Math.round(Number.isFinite(n) ? n : DEFAULT_GRID_PREFERENCES.gridColumnsMobile)),
  );
}

export function clampGridColumnsDesktop(n: number): number {
  return Math.min(
    GRID_COLUMNS_DESKTOP_MAX,
    Math.max(GRID_COLUMNS_DESKTOP_MIN, Math.round(Number.isFinite(n) ? n : DEFAULT_GRID_PREFERENCES.gridColumnsDesktop)),
  );
}

export function normalizeGridPreferences(p: Partial<GridPreferences> | null | undefined): GridPreferences {
  if (!p) return { ...DEFAULT_GRID_PREFERENCES };
  return {
    gridColumnsMobile: clampGridColumnsMobile(p.gridColumnsMobile ?? DEFAULT_GRID_PREFERENCES.gridColumnsMobile),
    gridColumnsDesktop: clampGridColumnsDesktop(p.gridColumnsDesktop ?? DEFAULT_GRID_PREFERENCES.gridColumnsDesktop),
  };
}
