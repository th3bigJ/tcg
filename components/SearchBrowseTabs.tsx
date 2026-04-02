"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TOP_CHROME_HIDDEN_TRANSFORM, TOP_CHROME_VISIBLE_TRANSFORM } from "@/lib/chromeVisibility";
import { useAutoHideChrome } from "@/lib/useAutoHideChrome";

export type SearchBrowseTab = "cards" | "sets" | "pokedex";

type Props = {
  activeTab: SearchBrowseTab;
  /** Cards tab URL (preserves filters on the card search view). Defaults to `/search`. */
  cardsHref?: string;
};

export function SearchBrowseTabs({ activeTab, cardsHref = "/search" }: Props) {
  const chromeVisible = useAutoHideChrome();
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState<SearchBrowseTab>(activeTab);

  useEffect(() => {
    router.prefetch(cardsHref);
    router.prefetch("/search?tab=sets");
    router.prefetch("/search?tab=pokedex");
  }, [router, cardsHref]);

  useEffect(() => {
    setSelectedTab(activeTab);
  }, [activeTab]);

  const btn = (tab: SearchBrowseTab, label: string, href: string) => {
    const isActive = selectedTab === tab;
    return (
      <Link
        href={href}
        prefetch
        role="tab"
        aria-selected={isActive}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          setSelectedTab(tab);
        }}
        onMouseEnter={() => router.prefetch(href)}
        onTouchStart={() => router.prefetch(href)}
        style={{ borderRadius: "999px" }}
        className={`flex-1 px-2 py-2 text-center text-xs font-medium transition sm:text-sm ${
          isActive
            ? "bg-[var(--foreground)]/15 text-[var(--foreground)]"
            : "text-[var(--foreground)]/55 hover:text-[var(--foreground)]/85"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div
      className="flex shrink-0 gap-1 border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 p-1 transition-[margin,opacity,transform] duration-200 ease-out"
      style={{
        borderRadius: "999px",
        marginBottom: chromeVisible ? "0.75rem" : "0",
        opacity: chromeVisible ? 1 : 0,
        transform: chromeVisible ? TOP_CHROME_VISIBLE_TRANSFORM : TOP_CHROME_HIDDEN_TRANSFORM,
        pointerEvents: chromeVisible ? "auto" : "none",
      }}
      role="tablist"
      aria-label="Search browse"
      aria-hidden={!chromeVisible}
    >
      {btn("cards", "Cards", cardsHref)}
      {btn("sets", "Sets", "/search?tab=sets")}
      {btn("pokedex", "Pokédex", "/search?tab=pokedex")}
    </div>
  );
}
