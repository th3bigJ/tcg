import { AppLoadingScreen } from "@/app/(app)/AppLoadingScreen";

export default function Loading() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--background)]">
      <AppLoadingScreen label="Loading dashboard" />
    </div>
  );
}
