import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { DevRuntimeGuards } from "@/app/(app)/DevRuntimeGuards";
import { BottomNav } from "@/components/BottomNav";
import { PullToRefresh } from "@/components/PullToRefresh";
import { UniversalSearch } from "@/components/UniversalSearch";
import { getCurrentCustomer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countUnreadTradeNotifications } from "@/lib/tradeNotificationsServer";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: "TCG",
  description: "Pokémon TCG",
  applicationName: "TCG",
  appleWebApp: {
    capable: true,
    title: "TCG",
    statusBarStyle: "black-translucent",
  },
};

function LayoutChromeFallback() {
  return (
    <>
      <UniversalSearch isLoggedIn={false} />
      <BottomNav isLoggedIn={false} initialFriendsUnreadCount={0} />
    </>
  );
}

async function LayoutChrome() {
  const customer = await getCurrentCustomer();
  const initialFriendsUnreadCount = customer
    ? await (async () => {
        const supabase = await createSupabaseServerClient();
        return countUnreadTradeNotifications(supabase);
      })()
    : 0;

  return (
    <>
      <UniversalSearch isLoggedIn={Boolean(customer)} />
      <BottomNav
        key={`${customer?.id ?? "guest"}:${initialFriendsUnreadCount}`}
        isLoggedIn={Boolean(customer)}
        initialFriendsUnreadCount={initialFriendsUnreadCount}
      />
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-[100dvh] flex-col bg-[var(--background)] text-[var(--foreground)]">
        <DevRuntimeGuards />
        <PullToRefresh />
        <Suspense fallback={<LayoutChromeFallback />}>
          <LayoutChrome />
        </Suspense>
        <div className="relative z-0 flex min-h-0 flex-1 flex-col pb-[var(--bottom-nav-offset)] pt-[var(--top-search-offset)]">
          {children}
        </div>
      </body>
    </html>
  );
}
