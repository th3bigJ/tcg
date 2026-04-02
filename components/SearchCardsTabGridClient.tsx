"use client";

import dynamic from "next/dynamic";

export const SearchCardsTabGridClient = dynamic(
  () => import("@/components/SearchCardsTabGrid").then((mod) => mod.SearchCardsTabGrid),
  { ssr: false },
);
