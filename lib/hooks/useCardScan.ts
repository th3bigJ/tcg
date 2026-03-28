"use client";

import { useEffect, useRef, useState } from "react";

import {
  extractCardTextFromImage,
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
  handleBurst: (files: File[], scanSettings?: Partial<ScanOcrSettings>) => Promise<void>;
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

  async function identifyFromOcr(ocrResult: OcrResult) {
    const response = await fetch("/api/scan/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardName: ocrResult.cardName,
        cardNumber: ocrResult.cardNumber,
        artist: ocrResult.artist,
        hp: ocrResult.hp,
      }),
    });

    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }

    return (await response.json()) as {
      candidates: CardsPageCardEntry[];
      confidence: "high" | "low";
    };
  }

  function scoreScanResult(result: {
    ocrResult: OcrResult;
    candidates: CardsPageCardEntry[];
    confidence: "high" | "low";
  }) {
    let score = 0;
    if (result.ocrResult.cardName.length >= 3) score += 25;
    if (result.ocrResult.cardNumber) score += 45;
    if (result.ocrResult.artist) score += 18;
    if (result.ocrResult.hp) score += 14;
    if (result.confidence === "high") score += 60;
    if (result.candidates.length > 0) score += 12;
    if (result.candidates.length === 1) score += 10;
    return score;
  }

  async function handleFile(file: File, scanSettings?: Partial<ScanOcrSettings>) {
    revokePreview();
    const preview = URL.createObjectURL(file);
    previewUrlRef.current = preview;
    setState({ status: "processing", preview });

    try {
      const ocrResult = await extractCardTextFromImage(file, scanSettings);
      console.log("[scan] OCR result:", ocrResult);
      setState({ status: "searching", preview, ocrResult });
      const data = await identifyFromOcr(ocrResult);

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

  async function handleBurst(files: File[], scanSettings?: Partial<ScanOcrSettings>) {
    if (files.length === 0) return;

    revokePreview();
    const preview = URL.createObjectURL(files[0]!);
    previewUrlRef.current = preview;
    setState({ status: "processing", preview });

    try {
      const attempts = await Promise.all(
        files.map(async (file) => {
          const ocrResult = await extractCardTextFromImage(file, scanSettings);
          const data = await identifyFromOcr(ocrResult);
          return { file, ocrResult, ...data };
        }),
      );

      attempts.sort((a, b) => scoreScanResult(b) - scoreScanResult(a));
      const best = attempts[0]!;
      revokePreview();
      const bestPreview = URL.createObjectURL(best.file);
      previewUrlRef.current = bestPreview;

      setState({ status: "searching", preview: bestPreview, ocrResult: best.ocrResult });
      setState({
        status: "results",
        preview: bestPreview,
        ocrResult: best.ocrResult,
        candidates: best.candidates,
        confidence: best.confidence,
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

  return { state, handleFile, handleBurst, reset };
}
