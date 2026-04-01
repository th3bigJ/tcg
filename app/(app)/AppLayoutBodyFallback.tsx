import { DevRuntimeGuards } from "@/app/(app)/DevRuntimeGuards";
import { CardGridPreferencesProvider } from "@/components/CardGridPreferencesProvider";
import { PullToRefresh } from "@/components/PullToRefresh";

/** Placeholder chrome while `AppLayoutBody` resolves (avoids client nav/search in Suspense fallback during prerender). */
function LayoutChromeSkeleton() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[1002] isolate"
        style={{ padding: "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) 1.25rem 0.5rem" }}
        aria-hidden="true"
      >
        <div
          className="mx-auto"
          style={{
            height: "3.25rem",
            maxWidth: "34rem",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#000",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        />
      </div>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] isolate"
        style={{ padding: "0.5rem 1.25rem max(0.25rem, calc(env(safe-area-inset-bottom, 0px) - 1rem))" }}
        aria-hidden="true"
      >
        <div
          className="mx-auto"
          style={{
            height: "4.5rem",
            maxWidth: "34rem",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#000",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        />
      </div>
    </>
  );
}

export function AppLayoutBodyFallback({ children }: { children: React.ReactNode }) {
  return (
    <CardGridPreferencesProvider initial={null} isLoggedIn={false}>
      <DevRuntimeGuards />
      <PullToRefresh />
      <LayoutChromeSkeleton />
      <div className="relative z-0 flex min-h-0 flex-1 flex-col pb-[var(--bottom-nav-offset)] pt-[var(--top-search-offset)]">
        {children}
      </div>
    </CardGridPreferencesProvider>
  );
}
