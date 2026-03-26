"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const SCROLL_STORAGE_KEY = "tcg-cards-load-more-scroll-y";

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

  function handleLoadMore() {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    const scrollY = scrollsWindow ? window.scrollY : (scrollRef.current?.scrollTop ?? 0);
    try { sessionStorage.setItem(SCROLL_STORAGE_KEY, String(scrollY)); } catch { /* ignore */ }
    startTransition(() => {
      router.push(loadMoreHref, { scroll: false });
    });
  }

  return (
    <div
      ref={scrollRef}
      className={scrollsWindow ? "min-h-0" : "scrollbar-hide min-h-0 flex-1 overflow-y-auto"}
    >
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
