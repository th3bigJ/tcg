"use client";

import type { ScanState } from "@/lib/hooks/useCardScan";

type Props = {
  state: ScanState;
};

export function ScanStatusBar({ state }: Props) {
  if (state.status === "idle" || state.status === "results") return null;

  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 rounded-b-xl bg-black/70 px-4 py-3 text-white backdrop-blur-sm">
      {state.status === "processing" && (
        <>
          <Spinner />
          <span className="text-sm font-medium">Reading card text…</span>
        </>
      )}

      {state.status === "searching" && (
        <>
          <Spinner />
          <span className="min-w-0 text-sm">
            Searching for{" "}
            <strong className="font-semibold">{state.ocrResult.cardName || "card"}</strong>
            {state.ocrResult.cardNumber ? (
              <span className="ml-1 opacity-80">{state.ocrResult.cardNumber}</span>
            ) : null}
            …
          </span>
        </>
      )}

      {state.status === "error" && (
        <span className="text-sm text-red-300">{state.message} — try again.</span>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 shrink-0 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
