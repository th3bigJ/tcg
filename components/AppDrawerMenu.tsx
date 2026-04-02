"use client";

import Link from "next/link";
import React from "react";

type DrawerItem = {
  href: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
};

function DrawerIconCompass() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.8 7-4.2-4.2 7-2.8Z" />
    </svg>
  );
}

function DrawerIconCards() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="6" width="10" height="13" rx="2" />
      <path d="M10 5h6a2 2 0 0 1 2 2v11" />
    </svg>
  );
}

function DrawerIconClock() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function DrawerIconGroups() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="7" cy="9" r="2.5" />
      <circle cx="17" cy="9" r="2.5" />
      <circle cx="12" cy="16" r="2.5" />
    </svg>
  );
}

function DrawerIconPlus() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function DrawerIconSparkles() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z" />
      <path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z" />
      <path d="m5 14 1 2.5L8.5 17 6 18l-1 2.5L4 18l-2.5-1L4 16.5Z" />
    </svg>
  );
}

function DrawerIconAccount() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function DrawerIconReceipt() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M7 4h10v16l-2-1.4L13 20l-2-1.4L9 20l-2-1.4L5 20V6a2 2 0 0 1 2-2Z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
    </svg>
  );
}

function DashboardGlyph() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 13.5 12 4l9 9.5" />
      <path d="M5 11.5V20h14v-8.5" />
      <path d="M9 20v-5h6v5" />
    </svg>
  );
}

export function AppDrawerMenu({
  isLoggedIn,
  onClose,
}: {
  isLoggedIn: boolean;
  onClose: () => void;
}) {
  const primaryItems: DrawerItem[] = [
    { href: "/dashboard", label: "Dashboard", description: "Overview and shortcuts", icon: <DashboardGlyph /> },
    { href: "/search", label: "Browse cards", description: "Search singles and sets", icon: <DrawerIconCompass /> },
    { href: "/collect", label: "Collection", description: "Track what you own", icon: <DrawerIconCards /> },
    { href: "/wishlist", label: "Wishlist", description: "Keep tabs on your targets", icon: <DrawerIconClock /> },
    { href: "/collect/shared", label: "Trading circle", description: "Shared collections and trades", icon: <DrawerIconGroups /> },
    { href: "/more/grade", label: "Grade opportunities", description: "Surface your best submissions", icon: <DrawerIconSparkles /> },
    { href: "/account/transactions", label: "Transactions", description: "Recent orders and purchases", icon: <DrawerIconReceipt /> },
  ];

  const accountItems: DrawerItem[] = isLoggedIn
    ? [
        { href: "/account", label: "Account", description: "Profile and app preferences", icon: <DrawerIconAccount /> },
      ]
    : [
        { href: "/login", label: "Sign in", description: "Pick up your saved collection", icon: <DrawerIconAccount /> },
        { href: "/register", label: "Create account", description: "Save activity across devices", icon: <DrawerIconPlus /> },
      ];
  return (
    <div className="flex h-full flex-col overflow-y-auto border-r border-white/8 bg-[#090a0d] pb-[calc(var(--bottom-nav-offset)+1.5rem)] pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.75rem))] text-white shadow-[18px_0_50px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between px-4 pb-4">
        <h2 className="text-[2rem] font-semibold tracking-tight">Menu</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-xl text-white/65 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="Close menu"
        >
          ×
        </button>
      </div>

      <div className="space-y-1 border-b border-white/10 px-4 pb-5">
        {primaryItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="flex items-center gap-4 rounded-2xl px-2 py-3 text-white/78 transition hover:bg-white/[0.05] hover:text-white"
          >
            <span className="text-white/62">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-medium">{item.label}</div>
              {item.description ? <p className="mt-0.5 text-sm text-white/40">{item.description}</p> : null}
            </div>
          </Link>
        ))}
      </div>

      <div className="px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/88">Account</h3>
          {!isLoggedIn ? <span className="text-sm text-white/40">Guest</span> : null}
        </div>
        <div className="space-y-1">
          {accountItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-4 rounded-2xl px-2 py-3 text-white/78 transition hover:bg-white/[0.05] hover:text-white"
            >
              <span className="text-white/62">{item.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium">{item.label}</div>
                {item.description ? <p className="mt-0.5 text-sm text-white/40">{item.description}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
