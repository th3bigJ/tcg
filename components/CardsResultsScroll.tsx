"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";

const SCROLL_STORAGE_KEY = "tcg-cards-load-more-scroll-y";
const PULL_THRESHOLD = 72;

type CardsResultsScrollProps = {
  children: ReactNode;
  canLoadMore: boolean;
  loadMoreHref: string;
  loadMoreStep: number;
  scrollRestoreKey: string;
  scrollsWindow?: boolean;
};

export function CardsResultsScroll({
  children,
  canLoadMore,
  loadMoreStep,
  loadMoreHref,
  scrollRestoreKey,
  scrollsWindow = false,
}: CardsResultsScrollProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const prevScrollRestoreKeyRef = useRef<string | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [pullY, setPullY] = useState(0);
  const touchStartYRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (prevScrollRestoreKeyRef.current !== scrollRestoreKey) {
      prevScrollRestoreKeyRef.current = scrollRestoreKey;
      setIsLoadingMore(false);
    }
    const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (raw === null) return;
    sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    const y = Number.parseInt(raw, 10);
    if (!Number.isFinite(y)) return;
    if (scrollsWindow) {
      window.scrollTo({ top: y, behavior: "instant" });
    } else {
      const el = scrollRef.current;
      if (el) el.scrollTop = y;
    }
  }, [scrollRestoreKey, scrollsWindow]);

  // Auto-trigger by observing the button itself — works regardless of scroll container
  useEffect(() => {
    if (!canLoadMore) return;
    const button = buttonRef.current;
    if (!button) return;

    let ready = false;
    const readyTimer = setTimeout(() => { ready = true; }, 300);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && ready) {
          button.click();
        }
      },
      { rootMargin: "0px 0px 200px 0px", threshold: 0 },
    );

    observer.observe(button);
    return () => {
      clearTimeout(readyTimer);
      observer.disconnect();
    };
  }, [canLoadMore, loadMoreHref, scrollRestoreKey]);

  function handleTouchStart(e: React.TouchEvent) {
    const scrollTop = scrollsWindow ? window.scrollY : (scrollRef.current?.scrollTop ?? 0);
    if (scrollTop > 0) return;
    touchStartYRef.current = e.touches[0]!.clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartYRef.current === null) return;
    const delta = e.touches[0]!.clientY - touchStartYRef.current;
    if (delta <= 0) {
      touchStartYRef.current = null;
      setPullY(0);
      return;
    }
    // Resist the pull with square-root damping
    setPullY(Math.min(PULL_THRESHOLD * 1.5, Math.sqrt(delta) * 5));
  }

  function handleTouchEnd() {
    if (touchStartYRef.current === null) return;
    touchStartYRef.current = null;
    if (pullY >= PULL_THRESHOLD && !isRefreshing) {
      startRefreshTransition(() => {
        router.refresh();
      });
    }
    setPullY(0);
  }

  function handleLoadMore() {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    const scrollY = scrollsWindow ? window.scrollY : (scrollRef.current?.scrollTop ?? 0);
    try { sessionStorage.setItem(SCROLL_STORAGE_KEY, String(scrollY)); } catch { /* ignore */ }
    startTransition(() => {
      router.push(loadMoreHref, { scroll: false });
    });
  }

  const pullProgress = Math.min(1, pullY / PULL_THRESHOLD);

  return (
    <div
      ref={scrollRef}
      className={scrollsWindow ? "min-h-0" : "scrollbar-hide min-h-0 flex-1 overflow-y-auto"}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {(pullY > 0 || isRefreshing) ? (
        <div
          className="pointer-events-none flex items-center justify-center gap-2 overflow-hidden transition-[height]"
          style={{ height: isRefreshing ? 40 : pullY * 0.55 }}
        >
          <svg
            className={isRefreshing ? "animate-spin" : ""}
            style={{
              opacity: isRefreshing ? 1 : pullProgress,
              transform: isRefreshing ? undefined : `rotate(${pullProgress * 270}deg)`,
              transition: isRefreshing ? undefined : "none",
            }}
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
          >
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
            <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {isRefreshing ? (
            <span className="text-xs text-[var(--foreground)]/60">Loading</span>
          ) : null}
        </div>
      ) : null}
      {children}
      {canLoadMore ? (
        <div className="flex items-center justify-center pb-[var(--bottom-nav-offset,0px)] pt-6">
          <button
            ref={buttonRef}
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18 disabled:opacity-50"
          >
            {isLoadingMore ? "Loading…" : `Load ${loadMoreStep} more`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
