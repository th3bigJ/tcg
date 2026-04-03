"use client";

import { useRouter } from "next/navigation";

export function SealedModalCloseHint({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
      className="mb-2 block w-full text-center text-[11px] text-white/65 transition hover:text-white/85"
      aria-label="Close sealed preview"
    >
      Tap here or swipe down from the top to close.
    </button>
  );
}
