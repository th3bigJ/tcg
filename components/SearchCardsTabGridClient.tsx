"use client";

import dynamic from "next/dynamic";

export const SearchCardsTabGridClient = dynamic(
  () => import("@/components/SearchCardsTabGrid").then((mod) => mod.SearchCardsTabGrid),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[1003] flex items-center justify-center bg-[var(--background)] px-6 text-center">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-white/75" />
          <p className="mt-5 text-base font-semibold text-white/90">Loading search</p>
          <p className="mt-1 text-sm text-white/45">Hang tight while we get everything ready.</p>
        </div>
      </div>
    ),
  },
);
