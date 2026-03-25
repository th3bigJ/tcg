"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

function IconHome({ active }: { active: boolean }) {
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
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconShop({ active }: { active: boolean }) {
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
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <line x1="3" x2="21" y1="6" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

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

const icons = [IconHome, IconShop, IconSearch, IconCollect, IconAccount] as const;

export function BottomNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const pathname = usePathname() ?? "";

  const items = useMemo((): NavItem[] => {
    const accountHref = isLoggedIn ? "/account" : "/login";
    const accountLabel = isLoggedIn ? "Account" : "Sign in";
    return [
      {
        href: "/home",
        label: "Home",
        match: (p) => p === "/home",
      },
      {
        href: "/shop",
        label: "Shop",
        match: (p) => p === "/shop",
      },
      {
        href: "/search",
        label: "Search",
        match: (p) => p === "/search" || p.startsWith("/search?") || p.startsWith("/pokedex") || p.startsWith("/expansions"),
      },
      {
        href: "/collect",
        label: "Collect",
        match: (p) => p === "/collect" || p === "/wishlist",
      },
      {
        href: accountHref,
        label: accountLabel,
        match: (p) => p === "/account" || p === "/login",
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
