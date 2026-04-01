import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";

import { AppLayoutBody } from "@/app/(app)/AppLayoutBody";
import { AppLayoutBodyFallback } from "@/app/(app)/AppLayoutBodyFallback";

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
        <Suspense fallback={<AppLayoutBodyFallback>{children}</AppLayoutBodyFallback>}>
          <AppLayoutBody>{children}</AppLayoutBody>
        </Suspense>
      </body>
    </html>
  );
}
