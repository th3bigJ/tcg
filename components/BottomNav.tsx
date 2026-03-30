"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { TRADE_NOTIFICATIONS_UPDATED_EVENT } from "@/lib/tradeNotificationsConstants";

type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
};

type MoreItem = {
  href: string;
  label: string;
  description: string;
};

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

function IconMore({ active }: { active: boolean }) {
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
      <circle cx="5" cy="12" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

const icons = [IconSearch, IconCollect, IconWishlist, IconFriends, IconMore] as const;

export function BottomNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const pathname = usePathname() ?? "";
  const [moreOpen, setMoreOpen] = useState(false);
  const [friendsUnreadCount, setFriendsUnreadCount] = useState(0);
  const visibleFriendsUnreadCount = isLoggedIn ? friendsUnreadCount : 0;

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/trade-notifications?countOnly=1", { credentials: "include" });
        if (!res.ok) return;
        const j = (await res.json()) as { count?: number };
        if (!cancelled) setFriendsUnreadCount(typeof j.count === "number" ? j.count : 0);
      } catch {
        if (!cancelled) setFriendsUnreadCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, pathname]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const onUpdate = () => {
      void (async () => {
        try {
          const res = await fetch("/api/trade-notifications?countOnly=1", { credentials: "include" });
          if (!res.ok) return;
          const j = (await res.json()) as { count?: number };
          setFriendsUnreadCount(typeof j.count === "number" ? j.count : 0);
        } catch {
          setFriendsUnreadCount(0);
        }
      })();
    };
    window.addEventListener(TRADE_NOTIFICATIONS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(TRADE_NOTIFICATIONS_UPDATED_EVENT, onUpdate);
  }, [isLoggedIn]);

  const items: NavItem[] = [
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
    {
      href: "/more",
      label: "More",
      match: (p) => p === "/more" || p.startsWith("/account") || p === "/login" || p === "/register",
    },
  ];

  const moreItems: MoreItem[] = isLoggedIn
    ? [
        {
          href: "/more/grade",
          label: "Grade opportunities",
          description: "Find the best cards in your collection to profit from grading.",
        },
        {
          href: "/account",
          label: "Account",
          description: "View your details and manage your sign-in.",
        },
        {
          href: "/account/transactions",
          label: "Transactions",
          description: "Review and manage your purchase history.",
        },
      ]
    : [
        {
          href: "/login",
          label: "Sign in",
          description: "Access your collection, wishlist, and account tools.",
        },
        {
          href: "/register",
          label: "Create account",
          description: "Set up an account to save your collection and activity.",
        },
      ];
  return (
    <>
      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] isolate"
        style={{ padding: "0.5rem 1.25rem env(safe-area-inset-bottom, 0px)" }}
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
          {items.map((item, i) => {
            const active = item.match(pathname) || (item.label === "More" && moreOpen);
            const Icon = icons[i];
            const itemClass = `flex min-w-0 basis-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium leading-tight transition-all sm:text-[11px]`;
            const itemStyle: React.CSSProperties = {
              borderRadius: "29px",
              padding: "0.375rem 0.75rem",
              color: active ? "white" : "rgba(255,255,255,0.45)",
              background: active ? "rgba(255,255,255,0.15)" : "transparent",
            };

            if (item.label === "More") {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className={itemClass}
                  style={itemStyle}
                  aria-current={active ? "page" : undefined}
                  aria-haspopup="dialog"
                  aria-expanded={moreOpen}
                  aria-controls="bottom-nav-more-sheet"
                >
                  <Icon active={active} />
                  <span className="max-w-full truncate">{item.label}</span>
                </button>
              );
            }

            const friendsPendingLabel =
              item.href === "/collect/shared" && visibleFriendsUnreadCount > 0
                ? `Friends, ${visibleFriendsUnreadCount} unread ${visibleFriendsUnreadCount === 1 ? "notification" : "notifications"}`
                : undefined;

            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                prefetch={
                  item.href === "/search" || item.href === "/collect" || item.href === "/collect/shared"
                }
                className={itemClass}
                style={itemStyle}
                aria-current={active ? "page" : undefined}
                aria-label={friendsPendingLabel}
              >
                <span className="relative inline-flex">
                  <Icon active={active} />
                  {item.href === "/collect/shared" && visibleFriendsUnreadCount > 0 ? (
                    <span
                      className="absolute -right-1 -top-0.5 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white dark:bg-red-500"
                      aria-hidden
                    >
                      {visibleFriendsUnreadCount > 9 ? "9+" : visibleFriendsUnreadCount}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      {moreOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[10001] flex flex-col justify-end bg-black/60"
              onClick={() => setMoreOpen(false)}
              role="presentation"
            >
              <div
                id="bottom-nav-more-sheet"
                className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 text-[var(--foreground)] shadow-xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="More"
              >
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--foreground)]/18" />
                <h2 className="text-lg font-semibold">More</h2>
                <p className="mt-1 text-sm text-[var(--foreground)]/65">
                  {isLoggedIn
                    ? "Quick access to account tools and activity."
                    : "Sign in or create an account to manage your collection and history."}
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  {moreItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className="rounded-xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/[0.05] px-4 py-3 transition hover:bg-[var(--foreground)]/[0.09]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">{item.label}</div>
                          <p className="mt-1 text-sm text-[var(--foreground)]/68">{item.description}</p>
                        </div>
                        <span
                          aria-hidden="true"
                          className="text-lg leading-none text-[var(--foreground)]/45"
                        >
                          ›
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="mt-6 w-full rounded-md border border-[var(--foreground)]/25 px-4 py-2 text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
