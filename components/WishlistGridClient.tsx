"use client";

import dynamic from "next/dynamic";

export const WishlistGridClient = dynamic(
  () => import("@/components/CollectCardGridWithTags").then((mod) => mod.CollectCardGridWithTags),
  {
    ssr: false,
    loading: () => (
      <div className="px-4 pb-4">
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div
              key={`wishlist-skel-${index}`}
              className="aspect-[3/4] animate-pulse rounded-lg border border-[var(--foreground)]/10 bg-[var(--foreground)]/6"
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    ),
  },
);
