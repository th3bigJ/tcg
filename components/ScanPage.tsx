"use client";

import { useCardScan } from "@/lib/hooks/useCardScan";
import { ScanUploadZone } from "@/components/ScanUploadZone";
import { ScanStatusBar } from "@/components/ScanStatusBar";
import { ScanResultsList } from "@/components/ScanResultsList";

type Props = {
  customerLoggedIn: boolean;
};

export function ScanPage({ customerLoggedIn }: Props) {
  const { state, handleFile, reset } = useCardScan();

  const showUpload = state.status === "idle" || state.status === "error";
  const showPreview =
    state.status === "processing" ||
    state.status === "searching" ||
    state.status === "results" ||
    state.status === "error";

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 pb-[max(2rem,var(--bottom-nav-offset))] pt-6">
      <h1 className="text-lg font-semibold">Scan a card</h1>

      {showUpload && (
        <ScanUploadZone
          onFile={handleFile}
          disabled={state.status !== "idle" && state.status !== "error"}
          preview={state.status === "error" ? state.preview : undefined}
        />
      )}

      {showPreview && state.status !== "idle" && (state.status === "processing" || state.status === "searching") && (
        <div
          className="relative w-full max-w-xs self-center overflow-hidden rounded-xl border border-[var(--foreground)]/15"
          style={{ aspectRatio: "2 / 3" }}
        >
          <img
            src={state.preview}
            alt="Card preview"
            className="h-full w-full object-cover"
          />
          <ScanStatusBar state={state} />
        </div>
      )}

      {state.status === "results" && (
        <>
          <div
            className="relative w-full max-w-xs self-center overflow-hidden rounded-xl border border-[var(--foreground)]/15"
            style={{ aspectRatio: "2 / 3" }}
          >
            <img
              src={state.preview}
              alt="Card preview"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="rounded-lg border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-3 font-mono text-xs text-[var(--foreground)]/70">
            <p><span className="font-semibold">name:</span> {state.ocrResult.cardName || <em>empty</em>}</p>
            <p><span className="font-semibold">number:</span> {state.ocrResult.cardNumber || <em>empty</em>}</p>
            <details className="mt-1">
              <summary className="cursor-pointer select-none text-[var(--foreground)]/50">raw text</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all">{state.ocrResult.rawText}</pre>
            </details>
          </div>

          <ScanResultsList
            candidates={state.candidates}
            confidence={state.confidence}
            customerLoggedIn={customerLoggedIn}
            ocrCardName={state.ocrResult.cardName}
          />

          <button
            type="button"
            onClick={reset}
            className="self-start rounded-lg border border-[var(--foreground)]/20 bg-[var(--foreground)]/8 px-4 py-2 text-sm font-medium transition active:opacity-70"
          >
            Scan another
          </button>
        </>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-500">{state.message}</p>
      )}
    </main>
  );
}
