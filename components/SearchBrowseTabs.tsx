"use client";

import Link from "next/link";

export type SearchBrowseTab = "cards" | "sets" | "pokedex";

type Props = {
  activeTab: SearchBrowseTab;
  /** Cards tab URL (preserves filters on the card search view). Defaults to `/search`. */
  cardsHref?: string;
};

export function SearchBrowseTabs({ activeTab, cardsHref = "/search" }: Props) {
  const btn = (tab: SearchBrowseTab, label: string, href: string) => {
    const isActive = activeTab === tab;
    return (
      <Link
        href={href}
        role="tab"
        aria-selected={isActive}
        className={`flex-1 rounded-lg px-2 py-2 text-center text-xs font-medium transition sm:text-sm ${
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
      className="mb-3 flex shrink-0 gap-1 rounded-xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 p-1"
      role="tablist"
      aria-label="Search browse"
    >
      {btn("cards", "Cards", cardsHref)}
      {btn("sets", "Sets", "/search?tab=sets")}
      {btn("pokedex", "Pokédex", "/search?tab=pokedex")}
    </div>
  );
}
