import { AppLoadingScreen } from "@/app/(app)/AppLoadingScreen";

export default function OnePieceLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:box-border lg:flex lg:h-[calc(100dvh-var(--bottom-nav-offset))] lg:max-h-[calc(100dvh-var(--bottom-nav-offset))] lg:min-h-0 lg:shrink-0">
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <AppLoadingScreen label="Loading One Piece" />
      </main>
    </div>
  );
}
