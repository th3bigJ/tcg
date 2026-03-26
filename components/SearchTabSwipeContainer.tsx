"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

const TABS = ["cards", "sets", "pokedex"] as const;
type Tab = (typeof TABS)[number];

const MIN_SWIPE_X = 50;
const MAX_SWIPE_Y = 80;
// How far the content slides before navigation fires (px)
const SLIDE_DISTANCE = 80;
// Duration of the exit slide animation (ms)
const SLIDE_DURATION = 180;

export function SearchTabSwipeContainer({
  activeTab,
  children,
  swipeEnabled = true,
}: {
  activeTab: Tab;
  children: ReactNode;
  swipeEnabled?: boolean;
}) {
  const router = useRouter();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [animating, setAnimating] = useState(false);

  const tabIndex = TABS.indexOf(activeTab);

  function navigateTo(nextTab: Tab, direction: "left" | "right") {
    if (animating) return;
    setAnimating(true);
    // Slide out: left swipe means content exits to the left
    const exitX = direction === "left" ? -SLIDE_DISTANCE : SLIDE_DISTANCE;
    setTranslateX(exitX);
    setTimeout(() => {
      router.push(`/search?tab=${nextTab}`);
      // Reset immediately — the new page will mount fresh
      setTranslateX(0);
      setAnimating(false);
    }, SLIDE_DURATION);
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{
        transform:
          swipeEnabled && translateX !== 0 ? `translateX(${translateX}px)` : undefined,
        transition:
          swipeEnabled && animating ? `transform ${SLIDE_DURATION}ms ease-in` : undefined,
        opacity: swipeEnabled && animating ? 0.6 : 1,
      }}
      onTouchStart={
        swipeEnabled
          ? (e) => {
              if (animating) return;
              touchStartX.current = e.touches[0].clientX;
              touchStartY.current = e.touches[0].clientY;
            }
          : undefined
      }
      onTouchMove={
        swipeEnabled
          ? (e) => {
              if (animating || touchStartX.current === null || touchStartY.current === null)
                return;
              const dx = e.touches[0].clientX - touchStartX.current;
              const dy = e.touches[0].clientY - touchStartY.current;
              // Only track horizontal swipes
              if (Math.abs(dy) > MAX_SWIPE_Y) return;
              // Clamp follow — only move if there's a valid tab to go to
              const canGoLeft = dx < 0 && tabIndex < TABS.length - 1;
              const canGoRight = dx > 0 && tabIndex > 0;
              if (!canGoLeft && !canGoRight) return;
              // Rubber-band resistance: follow at half speed, capped
              const clamped = Math.max(-60, Math.min(60, dx * 0.4));
              setTranslateX(clamped);
            }
          : undefined
      }
      onTouchEnd={
        swipeEnabled
          ? (e) => {
              if (touchStartX.current === null || touchStartY.current === null) return;
              const dx = e.changedTouches[0].clientX - touchStartX.current;
              const dy = e.changedTouches[0].clientY - touchStartY.current;
              touchStartX.current = null;
              touchStartY.current = null;

              if (Math.abs(dx) < MIN_SWIPE_X || Math.abs(dy) > MAX_SWIPE_Y) {
                // Snap back if swipe didn't qualify
                setTranslateX(0);
                return;
              }

              if (dx < 0 && tabIndex < TABS.length - 1) {
                navigateTo(TABS[tabIndex + 1], "left");
              } else if (dx > 0 && tabIndex > 0) {
                navigateTo(TABS[tabIndex - 1], "right");
              } else {
                setTranslateX(0);
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
