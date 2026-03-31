"use client";

import { useEffect, useRef, useState } from "react";

const MAX_PULL = 96;
const REFRESH_THRESHOLD = 72;

function isScrollable(el: HTMLElement) {
  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY;
  return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight;
}

function hasFixedAncestor(el: HTMLElement | null) {
  let node = el;
  while (node) {
    if (window.getComputedStyle(node).position === "fixed") return true;
    node = node.parentElement;
  }
  return false;
}

function findScrollableAncestor(el: HTMLElement | null) {
  let node = el;
  while (node) {
    if (isScrollable(node)) return node;
    node = node.parentElement;
  }
  return null;
}

export function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const eligibleRef = useRef(false);
  const trackingRef = useRef(false);
  const scrollTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reset = () => {
      trackingRef.current = false;
      eligibleRef.current = false;
      scrollTargetRef.current = null;
      setPullDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshing || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const target = event.target instanceof HTMLElement ? event.target : null;
      const scrollableAncestor = findScrollableAncestor(target);

      if (scrollableAncestor && hasFixedAncestor(scrollableAncestor)) {
        reset();
        return;
      }

      const isAtTop = scrollableAncestor ? scrollableAncestor.scrollTop <= 0 : window.scrollY <= 0;

      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      eligibleRef.current = isAtTop;
      trackingRef.current = isAtTop;
      scrollTargetRef.current = scrollableAncestor;

      if (!isAtTop) {
        setPullDistance(0);
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!trackingRef.current || !eligibleRef.current || refreshing || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaY = touch.clientY - startYRef.current;
      const deltaX = touch.clientX - startXRef.current;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        reset();
        return;
      }

      const isStillAtTop = scrollTargetRef.current ? scrollTargetRef.current.scrollTop <= 0 : window.scrollY <= 0;
      if (!isStillAtTop || deltaY <= 0) {
        setPullDistance(0);
        return;
      }

      const dampened = Math.min(MAX_PULL, deltaY * 0.45);
      setPullDistance(dampened);
      event.preventDefault();
    };

    const handleTouchEnd = () => {
      if (!trackingRef.current || refreshing) {
        reset();
        return;
      }

      const shouldRefresh = pullDistance >= REFRESH_THRESHOLD;
      reset();

      if (!shouldRefresh) return;

      setRefreshing(true);
      window.setTimeout(() => {
        window.location.reload();
      }, 120);
    };

    const handleTouchCancel = () => {
      if (!refreshing) reset();
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [pullDistance, refreshing]);

  const visible = pullDistance > 0 || refreshing;
  const ready = pullDistance >= REFRESH_THRESHOLD;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[1200] flex justify-center"
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))",
        opacity: visible ? 1 : 0,
        transform: `translateY(${visible ? 0 : -12}px)`,
        transition: refreshing ? "opacity 160ms ease" : "opacity 160ms ease, transform 160ms ease",
      }}
    >
      <div
        className="rounded-full border border-[var(--foreground)]/15 bg-[var(--background)]/92 px-4 py-2 text-xs font-medium text-[var(--foreground)] shadow-lg backdrop-blur"
        style={{
          transform: `translateY(${Math.max(0, pullDistance - 36)}px)`,
          transition: refreshing ? "transform 160ms ease" : "none",
        }}
      >
        {refreshing ? "Refreshing..." : ready ? "Release to refresh" : "Pull to refresh"}
      </div>
    </div>
  );
}
