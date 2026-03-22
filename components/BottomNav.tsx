"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

function IconCollection({ active }: { active: boolean }) {
  const c = active ? "text-[var(--foreground)]" : "text-[var(--foreground)]/45";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-6 w-6 ${c}`}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function IconPokedex({ active }: { active: boolean }) {
  const c = active ? "text-[var(--foreground)]" : "text-[var(--foreground)]/45";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-6 w-6 ${c}`}
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <circle cx="12" cy="9" r="2" />
      <path d="M8 14h8" />
    </svg>
  );
}

function IconExpansions({ active }: { active: boolean }) {
  const c = active ? "text-[var(--foreground)]" : "text-[var(--foreground)]/45";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-6 w-6 ${c}`}
      aria-hidden="true"
    >
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function IconWishlist({ active }: { active: boolean }) {
  const c = active ? "text-[var(--foreground)]" : "text-[var(--foreground)]/45";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-6 w-6 ${c}`}
      aria-hidden="true"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
    </svg>
  );
}

function IconSearch({ active }: { active: boolean }) {
  const c = active ? "text-[var(--foreground)]" : "text-[var(--foreground)]/45";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-6 w-6 ${c}`}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

const items: NavItem[] = [
  {
    href: "/",
    label: "Collection",
    match: (p) => p === "/",
  },
  {
    href: "/pokedex",
    label: "Pokedex",
    match: (p) => p === "/pokedex" || p.startsWith("/pokedex/"),
  },
  {
    href: "/expansions",
    label: "Expansions",
    match: (p) => p === "/expansions" || p.startsWith("/expansions/"),
  },
  {
    href: "/wishlist",
    label: "Wishlist",
    match: (p) => p === "/wishlist" || p.startsWith("/wishlist/"),
  },
  {
    href: "/cards",
    label: "Search",
    match: (p) => p === "/cards" || p.startsWith("/cards"),
  },
];

const icons = [IconCollection, IconPokedex, IconExpansions, IconWishlist, IconSearch] as const;

export function BottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-[var(--foreground)]/10 bg-[var(--background)]/95 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--background)]/85 dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex h-14 max-w-lg items-stretch justify-around px-1">
        {items.map((item, i) => {
          const active = item.match(pathname);
          const Icon = icons[i];
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.href === "/cards" || item.href === "/"}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-0.5 text-[10px] font-medium transition-colors ${
                active
                  ? "text-[var(--foreground)]"
                  : "text-[var(--foreground)]/50 hover:text-[var(--foreground)]/75"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon active={active} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
