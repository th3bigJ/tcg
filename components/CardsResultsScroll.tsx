"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type ReactNode } from "react";

const SCROLL_STORAGE_KEY = "tcg-cards-load-more-scroll-y";

type CardsResultsScrollProps = {
  children: ReactNode;
  canLoadMore: boolean;
  loadMoreHref: string;
  loadMoreStep: number;
  /** Must change when the /cards URL meaningfully changes (so we run after load-more navigation). */
  scrollRestoreKey: string;
};

export function CardsResultsScroll({
  children,
  canLoadMore,
  loadMoreHref,
  loadMoreStep,
  scrollRestoreKey,
}: CardsResultsScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (raw === null) return;
    sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    const y = Number.parseInt(raw, 10);
    if (!Number.isFinite(y) || !scrollRef.current) return;
    scrollRef.current.scrollTop = y;
  }, [scrollRestoreKey]);

  const persistScrollBeforeLoadMore = () => {
    const el = scrollRef.current;
    if (el) sessionStorage.setItem(SCROLL_STORAGE_KEY, String(el.scrollTop));
  };

  return (
    <div ref={scrollRef} className="scrollbar-hide min-h-0 overflow-y-auto">
      {children}
      {canLoadMore ? (
        <div className="flex justify-center pb-[var(--bottom-nav-offset,0px)] pt-4">
          <Link
            href={loadMoreHref}
            prefetch={false}
            scroll={false}
            onClick={persistScrollBeforeLoadMore}
            className="inline-flex min-h-[44px] min-w-[min(100%,12rem)] items-center justify-center rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-5 py-2.5 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
          >
            Load more ({loadMoreStep} more)
          </Link>
        </div>
      ) : null}
    </div>
  );
}
