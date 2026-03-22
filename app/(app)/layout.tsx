import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { BottomNav } from "@/components/BottomNav";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TCG",
  description: "Pokémon TCG",
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
      <body className="flex min-h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col pb-[var(--bottom-nav-offset)]">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}

