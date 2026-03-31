import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { DevRuntimeGuards } from "@/app/(app)/DevRuntimeGuards";
import { BottomNav } from "@/components/BottomNav";
import { PullToRefresh } from "@/components/PullToRefresh";
import { UniversalSearch } from "@/components/UniversalSearch";
import { getCurrentCustomer } from "@/lib/auth";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const customer = await getCurrentCustomer();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-[100dvh] flex-col bg-[var(--background)] text-[var(--foreground)]">
        <DevRuntimeGuards />
        <PullToRefresh />
        <UniversalSearch isLoggedIn={Boolean(customer)} />
        <div className="relative z-0 flex min-h-0 flex-1 flex-col pb-[var(--bottom-nav-offset)] pt-[var(--top-search-offset)]">
          {children}
        </div>
        <BottomNav isLoggedIn={Boolean(customer)} />
      </body>
    </html>
  );
}
