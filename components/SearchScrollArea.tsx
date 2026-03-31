"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { CHROME_SCROLL_EVENT } from "@/lib/chromeVisibility";
import { SEARCH_NAV_RESELECT_EVENT } from "@/lib/searchNavEvents";

export function SearchScrollArea({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSearchNavReselect = () => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener(SEARCH_NAV_RESELECT_EVENT, handleSearchNavReselect);
    return () => window.removeEventListener(SEARCH_NAV_RESELECT_EVENT, handleSearchNavReselect);
  }, []);

  return (
    <div
      ref={scrollRef}
      className={className}
      onScroll={() => {
        const scrollY = scrollRef.current?.scrollTop ?? 0;
        window.dispatchEvent(new CustomEvent(CHROME_SCROLL_EVENT, { detail: { scrollY } }));
      }}
    >
      {children}
    </div>
  );
}
