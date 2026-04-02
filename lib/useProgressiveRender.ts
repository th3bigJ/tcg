"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Options = {
  initialCount: number;
  step: number;
};

export function useProgressiveRender<T>(items: T[], { initialCount, step }: Options) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, items.length));
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(Math.min(initialCount, items.length));
  }, [initialCount, items]);

  useEffect(() => {
    if (visibleCount >= items.length) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((current) => Math.min(items.length, current + step));
      },
      { rootMargin: "400px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [items.length, step, visibleCount]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  return {
    hasMore: visibleCount < items.length,
    sentinelRef,
    visibleItems,
  };
}
