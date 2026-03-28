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

  async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      void promise.then(
        (value) => {
          window.clearTimeout(timeoutId);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
      );
    });
  }

  async function identifyScan(payload: {
    cardName?: string;
    cardNumber?: string;
    artist?: string;
    hp?: string;
    visualFingerprint?: OcrResult["visualFingerprint"];
    symbolFingerprint?: OcrResult["symbolFingerprint"];
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
      const { visualFingerprint, symbolFingerprint } = await withTimeout(
        prepareCardVisualFingerprint(file, scanSettings),
        5000,
        "Image prep took too long. Please try again.",
      );
      const visualData = await withTimeout(
        identifyScan({
          visualFingerprint,
          symbolFingerprint,
        }),
        4000,
        "Visual matching took too long. Please try again.",
      );
      const candidateHints: ExtractCardTextOptions["candidateCards"] = visualData.candidates
        .filter((candidate) => Boolean(candidate.masterCardId))
        .map((candidate) => ({
          masterCardId: candidate.masterCardId!,
          cardName: candidate.cardName,
          cardNumber: candidate.cardNumber,
          hp: candidate.hp,
        }));

      const ocrResult = await withTimeout(
        extractCardTextFromImage(file, {
          scanSettings,
          candidateCards: candidateHints,
        }),
        12000,
        "OCR took too long. Please try again.",
      );
      console.log("[scan] OCR result:", ocrResult);
      setState({ status: "searching", preview, ocrResult });
      const data = await withTimeout(
        identifyScan({
          cardName: ocrResult.cardName,
          cardNumber: ocrResult.cardNumber,
          artist: ocrResult.artist,
          hp: ocrResult.hp,
          visualFingerprint: ocrResult.visualFingerprint,
          symbolFingerprint: ocrResult.symbolFingerprint,
          candidateMasterCardIds: candidateHints?.map((candidate) => candidate.masterCardId),
        }),
        4000,
        "Card lookup took too long. Please try again.",
      );

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
