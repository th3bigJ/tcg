"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const SCROLL_STORAGE_KEY = "tcg-cards-load-more-scroll-y";
/** Dedupes rapid duplicate load-more navigations (e.g. React Strict Mode or IO firing twice). */
const LOAD_MORE_DEDUPE_KEY = "tcg-cards-load-more-dedupe";
const LOAD_MORE_DEDUPE_MS = 1500;

type CardsResultsScrollProps = {
  children: ReactNode;
  canLoadMore: boolean;
  loadMoreHref: string;
  loadMoreStep: number;
  /** Must change when the URL meaningfully changes (so we run after load-more navigation). */
  scrollRestoreKey: string;
  /**
   * Set to true when the page scrolls via the window rather than the inner div.
   * Uses root:null (viewport) for IntersectionObserver and window.scrollY for restore.
   */
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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggeredRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const prevScrollRestoreKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (prevScrollRestoreKeyRef.current !== scrollRestoreKey) {
      prevScrollRestoreKeyRef.current = scrollRestoreKey;
      loadMoreTriggeredRef.current = false;
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

  useEffect(() => {
    if (!canLoadMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Small delay so the observer doesn't fire immediately on mount/tab-switch
    // before the scroll container has settled.
    let ready = false;
    const readyTimer = setTimeout(() => { ready = true; }, 200);

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || loadMoreTriggeredRef.current || !ready) return;

        const now = Date.now();
        try {
          const dedupeRaw = sessionStorage.getItem(LOAD_MORE_DEDUPE_KEY);
          if (dedupeRaw) {
            const parsed = JSON.parse(dedupeRaw) as { h?: string; t?: number };
            if (
              typeof parsed.h === "string" &&
              typeof parsed.t === "number" &&
              parsed.h === loadMoreHref &&
              now - parsed.t < LOAD_MORE_DEDUPE_MS
            ) {
              return;
            }
          }
          sessionStorage.setItem(LOAD_MORE_DEDUPE_KEY, JSON.stringify({ h: loadMoreHref, t: now }));
        } catch {
          /* sessionStorage unavailable */
        }

        loadMoreTriggeredRef.current = true;
        setIsLoadingMore(true);
        const scrollY = scrollsWindow ? window.scrollY : (scrollRef.current?.scrollTop ?? 0);
        try { sessionStorage.setItem(SCROLL_STORAGE_KEY, String(scrollY)); } catch { /* ignore */ }
        try {
          startTransition(() => {
            router.push(loadMoreHref, { scroll: false });
          });
        } catch {
          loadMoreTriggeredRef.current = false;
          setIsLoadingMore(false);
        }
      },
      {
        root: scrollsWindow ? null : scrollRef.current,
        rootMargin: "0px 0px 360px 0px",
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => {
      clearTimeout(readyTimer);
      observer.disconnect();
    };
  }, [canLoadMore, loadMoreHref, scrollRestoreKey, scrollsWindow, router]);

  return (
    <div
      ref={scrollRef}
      className={
        scrollsWindow
          ? "min-h-0"
          : "scrollbar-hide min-h-0 overflow-y-auto lg:min-h-0 lg:flex-1"
      }
    >
      {children}
      {canLoadMore ? (
        <div
          ref={sentinelRef}
          className="flex min-h-10 flex-col items-center justify-center gap-2 pb-[var(--bottom-nav-offset,0px)] pt-4"
          aria-busy={isLoadingMore}
          aria-label={isLoadingMore ? "Loading more cards" : undefined}
        >
          {isLoadingMore ? (
            <span className="text-xs text-[var(--foreground)]/55">Loading more…</span>
          ) : (
            <span className="sr-only">
              Scroll to the bottom to load {loadMoreStep} more cards automatically.
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
