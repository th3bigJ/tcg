"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

import type { ExpansionSeriesGroup } from "@/lib/expansionsPageQueries";

export function ExpansionsList({
  groups,
  uniqueOwnedBySetCode = null,
}: {
  groups: ExpansionSeriesGroup[];
  uniqueOwnedBySetCode?: Record<string, number> | null;
}) {
  const [search, setSearch] = useState("");

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        sets: group.sets.filter(
          (set) =>
            set.name.toLowerCase().includes(q) ||
            group.seriesName.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.sets.length > 0);
  }, [groups, search]);

  if (groups.length === 0) {
    return (
      <p className="mt-8 text-center text-sm text-[var(--foreground)]/65">
        No expansions with artwork are available yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div>
        <input
          type="search"
          placeholder="Search sets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search sets"
          className="min-h-11 w-full rounded-xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 px-3 py-2 text-base leading-normal text-[var(--foreground)] placeholder:text-[var(--foreground)]/40 focus:border-[var(--foreground)]/30 focus:outline-none md:text-sm"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <p className="mt-6 text-center text-sm text-[var(--foreground)]/50">No sets match "{search}"</p>
      ) : (
        <div className="flex flex-col gap-8">
      {filteredGroups.map((group) => (
        <section key={group.seriesName} aria-labelledby={`series-${slugifyHeadingId(group.seriesName)}`}>
          <h2
            id={`series-${slugifyHeadingId(group.seriesName)}`}
            className="mb-3 text-center text-sm font-semibold tracking-wide text-[var(--foreground)]/85"
          >
            {group.seriesName}
          </h2>
          <ul className="flex flex-col gap-2">
            {group.sets.map((set) => {
              const showProgress = Boolean(uniqueOwnedBySetCode);
              const ownedCountRaw = uniqueOwnedBySetCode?.[set.code] ?? 0;
              const totalCards = set.totalCards > 0 ? set.totalCards : 0;
              const ownedCount = Math.max(
                0,
                totalCards > 0 ? Math.min(totalCards, ownedCountRaw) : ownedCountRaw,
              );
              const progressPct =
                totalCards > 0 ? Math.max(0, Math.min(100, (ownedCount / totalCards) * 100)) : 0;

              return (
                <li key={set.code}>
                  <Link
                    href={`/expansions/${encodeURIComponent(set.code)}`}
                    prefetch={false}
                    className="flex items-center gap-3 rounded-xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-3 py-2.5 shadow-sm transition hover:border-[var(--foreground)]/22 hover:bg-[var(--foreground)]/8 active:opacity-90"
                  >
                    <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--foreground)]/10 p-1.5">
                      <img
                        src={set.logoSrc}
                        alt=""
                        className="max-h-full max-w-full object-contain object-center"
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-left text-[15px] font-semibold leading-snug text-[var(--foreground)]">
                        {set.name}
                      </span>
                      {showProgress ? (
                        <>
                          <span className="mt-1.5 block text-left text-sm text-[var(--foreground)]/60">
                            {ownedCount} of {totalCards > 0 ? totalCards : "?"} collected
                          </span>
                          <span
                            className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--foreground)]/15"
                            aria-hidden
                          >
                            <span
                              className="block h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${progressPct}%` }}
                            />
                          </span>
                        </>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
        </div>
      )}
    </div>
  );
}

function slugifyHeadingId(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48);
}
