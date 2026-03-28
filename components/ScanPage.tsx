"use client";

import { useCardScan } from "@/lib/hooks/useCardScan";
import { ScanUploadZone } from "@/components/ScanUploadZone";
import { ScanResultsList } from "@/components/ScanResultsList";

type Props = {
  customerLoggedIn: boolean;
};

export function ScanPage({ customerLoggedIn }: Props) {
  const { state, handleFile, reset } = useCardScan();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-[max(2rem,var(--bottom-nav-offset))] pt-6">
      <h1 className="text-lg font-semibold">Scan a card</h1>

      <ScanUploadZone
        onFile={handleFile}
        onReset={reset}
        disabled={state.status === "processing" || state.status === "searching"}
        state={state}
      />

      {state.status === "results" && (
        <>
          <ScanResultsList
            candidates={state.candidates}
            confidence={state.confidence}
            customerLoggedIn={customerLoggedIn}
            ocrCardName={state.ocrResult.cardName}
          />
        </>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-500">{state.message}</p>
      )}
    </main>
  );
}
