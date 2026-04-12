"use client";

import dynamic from "next/dynamic";

const AdminClientNoSsr = dynamic(
  () => import("./AdminClient").then((mod) => mod.AdminClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[100dvh] items-center justify-center text-sm text-neutral-400">
        Loading admin...
      </div>
    ),
  },
);

export function AdminClientShell({ mediaBaseUrl }: { mediaBaseUrl: string }) {
  return <AdminClientNoSsr mediaBaseUrl={mediaBaseUrl} />;
}
