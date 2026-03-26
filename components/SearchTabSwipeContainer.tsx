"use client";

import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";

const TABS = ["cards", "sets", "pokedex"] as const;
type Tab = (typeof TABS)[number];

const MIN_SWIPE_X = 50;
const MAX_SWIPE_Y = 80;

export function SearchTabSwipeContainer({
  activeTab,
  children,
}: {
  activeTab: Tab;
  children: ReactNode;
}) {
  const router = useRouter();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const tabIndex = TABS.indexOf(activeTab);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null || touchStartY.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        touchStartX.current = null;
        touchStartY.current = null;

        if (Math.abs(dx) < MIN_SWIPE_X || Math.abs(dy) > MAX_SWIPE_Y) return;

        if (dx < 0 && tabIndex < TABS.length - 1) {
          router.push(`/search?tab=${TABS[tabIndex + 1]}`);
        } else if (dx > 0 && tabIndex > 0) {
          router.push(`/search?tab=${TABS[tabIndex - 1]}`);
        }
      }}
    >
      {children}
    </div>
  );
}
