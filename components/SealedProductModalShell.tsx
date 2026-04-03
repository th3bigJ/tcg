"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, type ReactNode } from "react";

const VERTICAL_CLOSE_PX = 120;

/**
 * Full-screen sealed product overlay: swipe down when scrolled to top closes (same idea as card modal).
 */
export function SealedProductModalShell({
  fallbackHref,
  children,
}: {
  fallbackHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDeltaRef = useRef({ x: 0, y: 0 });
  const axisLockRef = useRef<"none" | "v">("none");

  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [fallbackHref, router]);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    touchDeltaRef.current = { x: 0, y: 0 };
    axisLockRef.current = "none";
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.touches[0];
    const x = t.clientX - start.x;
    const y = t.clientY - start.y;
    touchDeltaRef.current = { x, y };
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    if (axisLockRef.current === "none" && (absX > 12 || absY > 12)) {
      axisLockRef.current = absY > absX ? "v" : "none";
    }
  };

  const onTouchEnd = () => {
    const start = touchStartRef.current;
    if (!start) return;
    touchStartRef.current = null;

    const { x, y } = touchDeltaRef.current;
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const atTop = scrollTop <= 1;

    const closeFromVertical =
      atTop &&
      y > VERTICAL_CLOSE_PX &&
      absY > absX &&
      (axisLockRef.current === "v" || absY > absX);

    axisLockRef.current = "none";

    if (closeFromVertical) {
      close();
    }
  };

  return (
    <div
      ref={scrollRef}
      className="card-viewer-overlay touch-pan-y fixed inset-0 z-[10050] isolate overflow-x-hidden overflow-y-auto overscroll-y-contain text-white md:overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  );
}
