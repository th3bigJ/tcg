"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

function IconCollect({ active }: { active: boolean }) {
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

function IconSets({ active }: { active: boolean }) {
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
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M8 4v16" />
      <path d="M16 4v16" />
      <path d="M2 12h20" />
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
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconAccount({ active }: { active: boolean }) {
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
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

const icons = [IconSearch, IconCollect, IconWishlist, IconSets, IconPokedex, IconAccount] as const;

export function BottomNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const pathname = usePathname() ?? "";

  const items = useMemo((): NavItem[] => {
    const accountHref = isLoggedIn ? "/account" : "/login";
    const accountLabel = isLoggedIn ? "Account" : "Sign in";
    return [
      {
        href: "/search",
        label: "Search",
        match: (p) => p === "/search" || p.startsWith("/search?") || p.startsWith("/scan"),
      },
      {
        href: "/collect",
        label: "Collect",
        match: (p) => p === "/collect",
      },
      {
        href: "/wishlist",
        label: "Wishlist",
        match: (p) => p === "/wishlist",
      },
      {
        href: "/expansions",
        label: "Sets",
        match: (p) => p === "/expansions" || p.startsWith("/expansions/"),
      },
      {
        href: "/pokedex",
        label: "Pokédex",
        match: (p) => p === "/pokedex" || p.startsWith("/pokedex/"),
      },
      {
        href: accountHref,
        label: accountLabel,
        match: (p) => p === "/account" || p.startsWith("/account/") || p === "/login",
      },
    ];
  }, [isLoggedIn]);

  return (
    <nav
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[1000] isolate border-t border-[var(--foreground)]/10 bg-[var(--background)] pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
      aria-label="Main navigation"
    >
      <div className="pointer-events-auto mx-auto flex h-14 max-w-2xl items-stretch justify-around px-0.5">
        {items.map((item, i) => {
          const active = item.match(pathname);
          const Icon = icons[i];
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              prefetch={item.href === "/search" || item.href === "/collect"}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-0.5 text-[9px] font-medium leading-tight transition-colors sm:text-[10px] ${
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
