"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import { SEARCH_NAV_RESELECT_EVENT } from "@/lib/searchNavEvents";
import { useAutoHideChrome } from "@/lib/useAutoHideChrome";

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

function IconDashboard({ active }: { active: boolean }) {
  const c = active ? "text-white" : "text-white/45";
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
      <path d="M3 13.5 12 4l9 9.5" />
      <path d="M5 11.5V20h14v-8.5" />
      <path d="M9 20v-5h6v5" />
    </svg>
  );
}

function IconCollect({ active }: { active: boolean }) {
  const c = active ? "text-white" : "text-white/45";
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
  const c = active ? "text-white" : "text-white/45";
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
  const c = active ? "text-white" : "text-white/45";
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

function IconFriends({ active }: { active: boolean }) {
  const c = active ? "text-white" : "text-white/45";
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

const icons = [IconDashboard, IconSearch, IconCollect, IconWishlist, IconFriends] as const;
const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    match: (p) =>
      p === "/dashboard" ||
      p.startsWith("/dashboard/") ||
      p === "/more" ||
      p.startsWith("/more/") ||
      p.startsWith("/account") ||
      p === "/login" ||
      p === "/register",
  },
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
    href: "/collect/shared",
    label: "Friends",
    match: (p) => p.startsWith("/collect/shared"),
  },
];

export function BottomNav() {
  const pathname = usePathname() ?? "";
  const chromeVisible = useAutoHideChrome();

  return (
    <>
      <nav
        className="app-menu-push-fixed pointer-events-none fixed inset-x-0 bottom-0 z-[1000] isolate transition-transform duration-200 ease-out"
        style={{
          padding: "0.5rem 1.25rem max(0.25rem, calc(env(safe-area-inset-bottom, 0px) - 1rem))",
          transform: chromeVisible ? "translate3d(0, 0, 0)" : "translate3d(0, 120%, 0)",
        }}
        aria-label="Main navigation"
      >
        <div
          className="pointer-events-auto mx-auto flex items-stretch justify-around gap-1"
          style={{
            height: "4.5rem",
            maxWidth: "34rem",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#000",
            padding: "0.375rem 0.75rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          {navItems.map((item, i) => {
            const active = item.match(pathname);
            const Icon = icons[i];
            const itemClass = `flex min-w-0 basis-0 flex-1 flex-col items-center justify-center gap-1 text-[9px] font-medium leading-tight transition-all sm:text-[10px]`;
            const itemStyle: React.CSSProperties = {
              borderRadius: "28px",
              padding: "0.375rem 0.75rem",
              color: active ? "white" : "rgba(255,255,255,0.45)",
              background: active ? "rgba(255,255,255,0.15)" : "transparent",
            };

            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                prefetch={
                  item.href === "/dashboard" ||
                  item.href === "/search" ||
                  item.href === "/collect" ||
                  item.href === "/wishlist" ||
                  item.href === "/collect/shared"
                }
                onClick={(event) => {
                  if (item.href === "/search" && pathname === "/search") {
                    event.preventDefault();
                    window.dispatchEvent(new CustomEvent(SEARCH_NAV_RESELECT_EVENT));
                  }
                }}
                className={itemClass}
                style={itemStyle}
                aria-current={active ? "page" : undefined}
              >
                <span className="inline-flex">
                  <Icon active={active} />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
