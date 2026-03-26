"use client";

import { useState } from "react";

import { extractCardTextFromImage, type OcrResult } from "@/lib/scanOcr";
import type { CardsPageCardEntry } from "@/lib/cardsPageQueries";

export type ScanState =
  | { status: "idle" }
  | { status: "processing"; preview: string }
  | { status: "searching"; preview: string; ocrResult: OcrResult }
  | {
      status: "results";
      preview: string;
      ocrResult: OcrResult;
      candidates: CardsPageCardEntry[];
      confidence: "high" | "low";
    }
  | { status: "error"; preview: string; message: string };

export function useCardScan(): {
  state: ScanState;
  handleFile: (file: File) => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<ScanState>({ status: "idle" });

  async function handleFile(file: File) {
    const preview = URL.createObjectURL(file);
    setState({ status: "processing", preview });

    try {
      const ocrResult = await extractCardTextFromImage(file);
      console.log("[scan] OCR result:", ocrResult);
      setState({ status: "searching", preview, ocrResult });

      const response = await fetch("/api/scan/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardName: ocrResult.cardName,
          cardNumber: ocrResult.cardNumber,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed (${response.status})`);
      }

      const data = (await response.json()) as {
        candidates: CardsPageCardEntry[];
        confidence: "high" | "low";
      };

      setState({
        status: "results",
        preview,
        ocrResult,
        candidates: data.candidates,
        confidence: data.confidence,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setState((prev) => ({
        status: "error",
        preview: prev.status !== "idle" ? prev.preview : "",
        message,
      }));
    }
  }

  function reset() {
    setState((prev) => {
      if (prev.status !== "idle") {
        URL.revokeObjectURL(prev.preview);
      }
      return { status: "idle" };
    });
  }

  return { state, handleFile, reset };
}
