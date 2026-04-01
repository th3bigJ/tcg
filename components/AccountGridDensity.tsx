"use client";

import { useCardGridPreferences } from "@/components/CardGridPreferencesProvider";
import {
  GRID_COLUMNS_DESKTOP_MAX,
  GRID_COLUMNS_DESKTOP_MIN,
  GRID_COLUMNS_MOBILE_MAX,
  GRID_COLUMNS_MOBILE_MIN,
} from "@/lib/gridPreferences";

export function AccountGridDensity() {
  const { preferences, updatePreferences, pending } = useCardGridPreferences();

  return (
    <section className="mt-8 border-t border-[var(--foreground)]/15 pt-6">
      <h2 className="text-base font-semibold text-[var(--foreground)]">Card grid</h2>
      <p className="mt-1 text-sm text-[var(--foreground)]/65">
        Narrow screens use “mobile” columns; from the medium breakpoint up, “desktop” columns apply. Saved to your
        account.
      </p>
      <div className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-[var(--foreground)]">
            Mobile ({GRID_COLUMNS_MOBILE_MIN}–{GRID_COLUMNS_MOBILE_MAX} columns)
          </span>
          <input
            type="range"
            min={GRID_COLUMNS_MOBILE_MIN}
            max={GRID_COLUMNS_MOBILE_MAX}
            step={1}
            value={preferences.gridColumnsMobile}
            disabled={pending}
            onChange={(e) => updatePreferences({ gridColumnsMobile: parseInt(e.target.value, 10) })}
            className="w-full accent-[var(--foreground)] disabled:opacity-50"
          />
          <span className="mt-1 block text-xs tabular-nums text-[var(--foreground)]/55">
            {preferences.gridColumnsMobile} columns
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-[var(--foreground)]">
            Desktop ({GRID_COLUMNS_DESKTOP_MIN}–{GRID_COLUMNS_DESKTOP_MAX} columns)
          </span>
          <input
            type="range"
            min={GRID_COLUMNS_DESKTOP_MIN}
            max={GRID_COLUMNS_DESKTOP_MAX}
            step={1}
            value={preferences.gridColumnsDesktop}
            disabled={pending}
            onChange={(e) => updatePreferences({ gridColumnsDesktop: parseInt(e.target.value, 10) })}
            className="w-full accent-[var(--foreground)] disabled:opacity-50"
          />
          <span className="mt-1 block text-xs tabular-nums text-[var(--foreground)]/55">
            {preferences.gridColumnsDesktop} columns
          </span>
        </label>
      </div>
    </section>
  );
}
