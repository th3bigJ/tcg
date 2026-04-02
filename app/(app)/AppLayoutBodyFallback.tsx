import { AppLoadingScreen } from "@/app/(app)/AppLoadingScreen";

export function AppLayoutBodyFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--background)] text-[var(--foreground)]">
      <AppLoadingScreen />
      <div className="hidden">{children}</div>
    </div>
  );
}
