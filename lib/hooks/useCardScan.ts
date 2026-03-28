"use client";

import { useEffect, useRef, useState } from "react";

import {
  extractCardTextFromImage,
  prepareCardVisualFingerprint,
  type ExtractCardTextOptions,
  type OcrResult,
  type ScanOcrSettings,
} from "@/lib/scanOcr";
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
  handleFile: (file: File, scanSettings?: Partial<ScanOcrSettings>) => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const previewUrlRef = useRef<string | null>(null);

  function revokePreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  async function identifyScan(payload: {
    cardName?: string;
    cardNumber?: string;
    artist?: string;
    hp?: string;
    visualFingerprint?: OcrResult["visualFingerprint"];
    candidateMasterCardIds?: string[];
  }) {
    const response = await fetch("/api/scan/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }

    return (await response.json()) as {
      candidates: CardsPageCardEntry[];
      confidence: "high" | "low";
    };
  }

  async function handleFile(file: File, scanSettings?: Partial<ScanOcrSettings>) {
    revokePreview();
    const preview = URL.createObjectURL(file);
    previewUrlRef.current = preview;
    setState({ status: "processing", preview });

    try {
      const visualFingerprint = await prepareCardVisualFingerprint(file, scanSettings);
      const visualData = await identifyScan({
        visualFingerprint,
      });
      const candidateHints: ExtractCardTextOptions["candidateCards"] = visualData.candidates
        .filter((candidate) => Boolean(candidate.masterCardId))
        .map((candidate) => ({
          masterCardId: candidate.masterCardId!,
          cardName: candidate.cardName,
          cardNumber: candidate.cardNumber,
          hp: candidate.hp,
        }));

      const ocrResult = await extractCardTextFromImage(file, {
        scanSettings,
        candidateCards: candidateHints,
      });
      console.log("[scan] OCR result:", ocrResult);
      setState({ status: "searching", preview, ocrResult });
      const data = await identifyScan({
        cardName: ocrResult.cardName,
        cardNumber: ocrResult.cardNumber,
        artist: ocrResult.artist,
        hp: ocrResult.hp,
        visualFingerprint: ocrResult.visualFingerprint,
        candidateMasterCardIds: candidateHints?.map((candidate) => candidate.masterCardId),
      });

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
    revokePreview();
    setState({ status: "idle" });
  }

  useEffect(() => revokePreview, []);

  return { state, handleFile, reset };
}
