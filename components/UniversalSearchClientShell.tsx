"use client";

import dynamic from "next/dynamic";

const UniversalSearchNoSsr = dynamic(
  () => import("@/components/UniversalSearch").then((mod) => mod.UniversalSearch),
  { ssr: false },
);

export function UniversalSearchClientShell({ isLoggedIn }: { isLoggedIn: boolean }) {
  return <UniversalSearchNoSsr isLoggedIn={isLoggedIn} />;
}
