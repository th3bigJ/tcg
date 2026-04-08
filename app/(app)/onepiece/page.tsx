import type { Metadata } from "next";
import { Suspense } from "react";

import { AppLoadingScreen } from "@/app/(app)/AppLoadingScreen";
import { OnePieceBrowseClient } from "@/components/OnePieceBrowseClient";
import { getPublicMediaBaseUrl } from "@/lib/media";
import {
  fetchOnePieceCardsFromR2,
  fetchOnePieceSetsFromR2,
  type OnePieceCardRecord,
  type OnePieceSetRecord,
} from "@/lib/onepieceBrowse";

const shellClass =
  "flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:box-border lg:flex lg:h-[calc(100dvh-var(--bottom-nav-offset))] lg:max-h-[calc(100dvh-var(--bottom-nav-offset))] lg:min-h-0 lg:shrink-0";

export const metadata: Metadata = {
  title: "One Piece TCG",
  description: "Browse One Piece card catalog",
};

type PageProps = {
  searchParams?: Promise<{ set?: string }>;
};

function OnePieceFallback() {
  return (
    <div className={shellClass}>
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <AppLoadingScreen label="Loading One Piece" />
      </main>
    </div>
  );
}

export default function OnePiecePage(props: PageProps) {
  return (
    <Suspense fallback={<OnePieceFallback />}>
      <OnePiecePageContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function OnePiecePageContent({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const mediaBaseUrl = getPublicMediaBaseUrl() ?? "";

  let sets: OnePieceSetRecord[] = [];
  let errorMessage: string | null = null;

  if (!mediaBaseUrl) {
    errorMessage =
      "Set R2_PUBLIC_BASE_URL or NEXT_PUBLIC_R2_PUBLIC_BASE_URL so One Piece catalog and images can load from your bucket.";
  } else {
    try {
      sets = await fetchOnePieceSetsFromR2();
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Could not load One Piece sets from R2.";
    }
  }

  const setCodes = new Set(sets.map((s) => s.setCode.toUpperCase()));
  const requested = (resolved.set ?? "").trim().toUpperCase();
  const initialSetCode =
    requested && setCodes.has(requested) ? requested : (sets[0]?.setCode.toUpperCase() ?? "");

  let initialCards: OnePieceCardRecord[] = [];
  if (mediaBaseUrl && initialSetCode && !errorMessage) {
    try {
      initialCards = await fetchOnePieceCardsFromR2(initialSetCode);
    } catch {
      initialCards = [];
    }
  }

  return (
    <div className={shellClass}>
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-2 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div className="mb-2 shrink-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">One Piece TCG</h1>
          <p className="mt-0.5 text-sm text-[var(--foreground)]/55">
            Browse cards from cloud storage (same layout as Pokémon search).
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <OnePieceBrowseClient
            sets={sets}
            mediaBaseUrl={mediaBaseUrl}
            initialSetCode={initialSetCode}
            initialCards={initialCards}
            errorMessage={errorMessage}
          />
        </div>
      </main>
    </div>
  );
}
