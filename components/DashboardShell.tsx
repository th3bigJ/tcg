"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AppDrawerMenu } from "@/components/AppDrawerMenu";
import { DASHBOARD_MENU_TOGGLE_EVENT } from "@/lib/dashboardMenuEvents";

type DashboardShellProps = {
  isLoggedIn: boolean;
  displayName: string;
  collectionValueLabel: string;
  cardsOwnedCount: number;
  wishlistCount: number;
};

function DrawerIconArrow() {
  return (
    <svg className="h-4 w-4 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function DashboardShell({
  isLoggedIn,
  displayName,
  collectionValueLabel,
  cardsOwnedCount,
  wishlistCount,
}: DashboardShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const handleToggle = () => setDrawerOpen((current) => !current);
    const handleClose = () => setDrawerOpen(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };

    window.addEventListener(DASHBOARD_MENU_TOGGLE_EVENT, handleToggle);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener(DASHBOARD_MENU_TOGGLE_EVENT, handleToggle);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (drawerOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = previousOverflow;

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  useEffect(() => {
    document.body.classList.toggle("app-menu-open", drawerOpen);
    return () => document.body.classList.remove("app-menu-open");
  }, [drawerOpen]);

  const quickStats = [
    { label: "Collection value", value: collectionValueLabel, detail: "Based on current market pricing" },
    { label: "Cards owned", value: cardsOwnedCount.toLocaleString("en-GB"), detail: "Across your collection" },
    { label: "Wishlist targets", value: wishlistCount.toLocaleString("en-GB"), detail: "Cards you are chasing" },
  ];

  return (
    <div className="relative min-h-[calc(100dvh-var(--top-search-offset))] overflow-hidden bg-[#050608] text-white">
      <div className="relative min-h-[calc(100dvh-var(--top-search-offset))] bg-[#050608]">
        <div className="relative min-h-[calc(100dvh-var(--top-search-offset))] px-4 pb-8 pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Hi, {displayName}</h1>
          </div>

          <div className="mt-6 rounded-[2rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_35%),linear-gradient(160deg,#111318_0%,#0c0d10_65%,#090a0c_100%)] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
            <div>
              <p className="text-sm text-white/56">Today’s snapshot</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Your collection at a glance</h2>
              <p className="mt-2 max-w-xs text-sm leading-6 text-white/60">
                A quick summary of your collection value, owned cards, and wishlist progress.
              </p>
            </div>

            <div className="mt-5 grid gap-3">
              {quickStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[1.4rem] border border-white/7 bg-white/[0.03] px-4 py-3"
                >
                  <div className="text-sm text-white/45">{stat.label}</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight">{stat.value}</div>
                  <div className="mt-1 text-sm text-white/42">{stat.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Quick actions</h2>
              <span className="text-sm text-white/40">Browse</span>
            </div>
            <div className="grid gap-3">
              {[
                { href: "/search", label: "Browse cards", description: "Search singles and sets" },
                { href: "/expansions", label: "Browse sets", description: "Explore expansions and set lists" },
                { href: "/pokedex", label: "Browse Pokemon", description: "Jump by national dex and species" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-4 rounded-[1.6rem] border border-white/8 bg-[#0e1014] px-4 py-4 transition hover:border-white/14 hover:bg-[#13161c]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold">{item.label}</div>
                    {item.description ? <p className="mt-1 text-sm text-white/45">{item.description}</p> : null}
                  </div>
                  <DrawerIconArrow />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      {drawerOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1003] bg-black/55"
              onClick={() => setDrawerOpen(false)}
              role="presentation"
            >
              <aside
                className="app-menu-drawer pointer-events-auto h-full w-[min(82vw,22rem)]"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
              >
                <AppDrawerMenu isLoggedIn={isLoggedIn} onClose={() => setDrawerOpen(false)} />
              </aside>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
