import { Suspense } from "react";

/**
 * Suspense must wrap this segment’s `children` so async server work (auth, cookies)
 * is not treated as blocking the shell under `cacheComponents`.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
