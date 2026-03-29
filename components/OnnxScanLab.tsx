"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import {
  detectCardCorners,
  renderDetectionCrop,
  type CardCornerDetection,
  type ScanPoint,
} from "@/lib/onnxCardDetector";
import { CardGrid } from "@/components/CardGrid";
import type { CardsPageCardEntry } from "@/lib/cardsPageQueries";
import {
  loadMobileClipEmbeddingIndex,
  probeMobileClipAssets,
  searchMobileClipEmbeddingIndex,
  type LoadedMobileClipEmbeddingIndex,
  type MobileClipSearchHit,
} from "@/lib/mobileclipEmbeddingIndex";
import { embedImageWithMobileClip } from "@/lib/mobileclipOnnx";
import { resolveMediaURL } from "@/lib/media";

const VIEWPORT_ASPECT = 3 / 4;
const GUIDE = {
  left: 0.1,
  right: 0.9,
  top: 0.08,
  bottom: 0.92,
} as const;

type DetectionState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "done";
      sourceUrl: string;
      overlayUrl: string;
      cropUrl: string;
      detection: CardCornerDetection;
    }
  | { status: "error"; sourceUrl?: string; message: string };

type OcrPreview = {
  nameStripUrl: string;
  hpStripUrl: string;
  numberStripUrl: string;
};

type IdentifyState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "done";
      ocr: {
        cardName: string;
        hp: string;
        cardNumber: string;
        rawName: string;
        rawHp: string;
        rawNumber: string;
      };
      preview: OcrPreview;
      candidates: CardsPageCardEntry[];
      confidence: "high" | "low";
    }
  | { status: "error"; message: string };

type VisualState =
  | { status: "idle" }
  | { status: "loading-assets" }
  | { status: "running" }
  | {
      status: "done";
      inferenceMs: number;
      topMatches: MobileClipSearchHit[];
      modelName: string;
      indexCount: number;
    }
  | { status: "error"; message: string };

type VisualAssetsState =
  | { status: "checking" }
  | { status: "ready"; modelName: string; indexCount: number; smokeTest?: boolean }
  | { status: "missing"; message: string };

type CombinedHit = {
  key: string;
  cardName: string;
  cardNumber: string;
  setLabel: string;
  imageSrc: string;
  href: string;
  sources: string[];
  score: number;
};

const OCR_REGIONS = {
  name: { xStart: 0.06, xEnd: 0.8, yStart: 0.02, yEnd: 0.14 },
  hp: { xStart: 0.74, xEnd: 0.98, yStart: 0.01, yEnd: 0.13 },
  number: { xStart: 0.03, xEnd: 0.3, yStart: 0.9, yEnd: 0.985 },
} as const;

function readGuideCrop(video: HTMLVideoElement) {
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) {
    throw new Error("Camera feed is not ready yet.");
  }

  const videoAspect = videoWidth / videoHeight;
  let visibleSrcX = 0;
  let visibleSrcY = 0;
  let visibleSrcWidth = videoWidth;
  let visibleSrcHeight = videoHeight;

  if (videoAspect > VIEWPORT_ASPECT) {
    visibleSrcWidth = videoHeight * VIEWPORT_ASPECT;
    visibleSrcX = (videoWidth - visibleSrcWidth) / 2;
  } else {
    visibleSrcHeight = videoWidth / VIEWPORT_ASPECT;
    visibleSrcY = (videoHeight - visibleSrcHeight) / 2;
  }

  const guideSrcX = visibleSrcX + visibleSrcWidth * GUIDE.left;
  const guideSrcY = visibleSrcY + visibleSrcHeight * GUIDE.top;
  const guideSrcWidth = visibleSrcWidth * (GUIDE.right - GUIDE.left);
  const guideSrcHeight = visibleSrcHeight * (GUIDE.bottom - GUIDE.top);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(guideSrcWidth);
  canvas.height = Math.round(guideSrcHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create capture canvas.");
  }

  ctx.drawImage(
    video,
    guideSrcX,
    guideSrcY,
    guideSrcWidth,
    guideSrcHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas;
}

function drawDetectionOverlay(sourceCanvas: HTMLCanvasElement, corners: ScanPoint[]) {
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = sourceCanvas.width;
  overlayCanvas.height = sourceCanvas.height;
  const ctx = overlayCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create overlay canvas.");
  }

  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = Math.max(3, Math.round(Math.min(sourceCanvas.width, sourceCanvas.height) * 0.01));
  ctx.beginPath();
  ctx.moveTo(corners[0]!.x, corners[0]!.y);
  for (const point of corners.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "#22d3ee";
  for (const point of corners) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(4, Math.round(sourceCanvas.width * 0.012)), 0, Math.PI * 2);
    ctx.fill();
  }

  return overlayCanvas;
}

function canvasToFile(canvas: HTMLCanvasElement) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode the captured frame."));
        return;
      }

      resolve(
        new File([blob], `scan-${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        }),
      );
    }, "image/jpeg", 0.95);
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/jpeg", 0.95);
}

function cropRegion(
  sourceCanvas: HTMLCanvasElement,
  region: { xStart: number; xEnd: number; yStart: number; yEnd: number },
  upscale = 1,
) {
  const srcX = Math.round(sourceCanvas.width * region.xStart);
  const srcY = Math.round(sourceCanvas.height * region.yStart);
  const srcW = Math.max(1, Math.round(sourceCanvas.width * (region.xEnd - region.xStart)));
  const srcH = Math.max(1, Math.round(sourceCanvas.height * (region.yEnd - region.yStart)));
  const canvas = document.createElement("canvas");
  canvas.width = srcW * upscale;
  canvas.height = srcH * upscale;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create OCR crop canvas.");
  }
  ctx.drawImage(sourceCanvas, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function preprocessStrip(sourceCanvas: HTMLCanvasElement, threshold: number, contrast: number) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create OCR preprocess canvas.");
  }

  ctx.drawImage(sourceCanvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let min = 255;
  let max = 0;
  for (let index = 0; index < data.length; index += 4) {
    const grey = 0.299 * (data[index] ?? 0) + 0.587 * (data[index + 1] ?? 0) + 0.114 * (data[index + 2] ?? 0);
    min = Math.min(min, grey);
    max = Math.max(max, grey);
    data[index] = grey;
    data[index + 1] = grey;
    data[index + 2] = grey;
  }

  const range = max - min || 1;
  for (let index = 0; index < data.length; index += 4) {
    const stretched = (((data[index] ?? 0) - min) / range) * 255;
    const contrasted = (stretched - 128) * contrast + 128;
    const output = contrasted >= threshold ? 255 : 0;
    data[index] = output;
    data[index + 1] = output;
    data[index + 2] = output;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode OCR canvas."));
    }, "image/png");
  });
}

async function recognizeText(
  worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>,
  canvas: HTMLCanvasElement,
  whitelist: string,
) {
  await worker.setParameters({
    tessedit_char_whitelist: whitelist,
    preserve_interword_spaces: "1",
  });
  const result = await worker.recognize(await canvasToBlob(canvas));
  return result.data.text.trim();
}

function parseName(raw: string) {
  return raw
    .split(/[\n\r]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .replace(/\bBASIC\b/gi, "")
        .replace(/\bSTAGE\s*\d+\b/gi, "")
        .replace(/\bHP\s*\d+\b/gi, "")
        .replace(/[^A-Za-zÀ-ÿ0-9 .,'\-]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .find((line) => line.length >= 3) ?? "";
}

function parseHp(raw: string) {
  const match = raw.match(/\b(\d{2,3})\b/);
  return match?.[1] ?? "";
}

function parseCardNumber(raw: string) {
  const normalized = raw.replace(/[Oo]/g, "0").replace(/\s*\/\s*/g, "/");
  const match = normalized.match(/\b([A-Z0-9]{1,6}\/\d{2,3})\b/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function buildCombinedHits(
  identifyState: IdentifyState,
  visualState: VisualState,
) {
  const combined = new Map<string, CombinedHit>();

  if (identifyState.status === "done") {
    identifyState.candidates.forEach((candidate, index) => {
      const key = candidate.masterCardId ?? `${candidate.set}:${candidate.filename}`;
      const existing = combined.get(key);
      const score = 1 / (index + 1);
      combined.set(key, {
        key,
        cardName: candidate.cardName,
        cardNumber: candidate.cardNumber || "No number",
        setLabel: candidate.setName || candidate.set,
        imageSrc: candidate.lowSrc,
        href: `/cards?search=${encodeURIComponent(candidate.cardName)}`,
        sources: existing ? [...existing.sources, "ocr"] : ["ocr"],
        score: (existing?.score ?? 0) + score,
      });
    });
  }

  if (visualState.status === "done") {
    visualState.topMatches.forEach((match, index) => {
      const key = match.card.masterCardId ?? `${match.card.setCode}:${match.card.filename}`;
      const existing = combined.get(key);
      const score = 1 / (index + 1);
      combined.set(key, {
        key,
        cardName: match.card.cardName || "Unknown card",
        cardNumber: match.card.cardNumber || "No number",
        setLabel: match.card.setName || match.card.setCode || "Unknown set",
        imageSrc: resolveMediaURL(match.card.lowSrc || match.card.image),
        href: `/cards?search=${encodeURIComponent(match.card.cardName ?? "")}`,
        sources: existing ? [...existing.sources, "visual"] : ["visual"],
        score: (existing?.score ?? 0) + score,
      });
    });
  }

  return [...combined.values()]
    .map((hit) => ({ ...hit, sources: [...new Set(hit.sources)] }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

export function OnnxScanLab({
  customerLoggedIn = false,
}: {
  customerLoggedIn?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const embeddingIndexPromiseRef = useRef<Promise<LoadedMobileClipEmbeddingIndex> | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelHint, setModelHint] = useState(
    "Default model: merged UVDoc at /models/card-corners.onnx",
  );
  const [detectionState, setDetectionState] = useState<DetectionState>({ status: "idle" });
  const [identifyState, setIdentifyState] = useState<IdentifyState>({ status: "idle" });
  const [visualState, setVisualState] = useState<VisualState>({ status: "idle" });
  const [visualAssetsState, setVisualAssetsState] = useState<VisualAssetsState>({
    status: "checking",
  });

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      setCameraError("");
      setCameraReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Unable to access the camera.");
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function refreshVisualAssets(signal?: { cancelled: boolean }) {
    setVisualAssetsState({ status: "checking" });
    try {
      const metadata = await probeMobileClipAssets();
      if (signal?.cancelled) return;
      setVisualAssetsState({
        status: "ready",
        modelName: metadata.encoder.modelName,
        indexCount: metadata.count,
        smokeTest: metadata.smokeTest,
      });
    } catch (error) {
      if (signal?.cancelled) return;
      setVisualAssetsState({
        status: "missing",
        message: error instanceof Error ? error.message : "MobileCLIP assets are not available yet.",
      });
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function checkAssets() {
      try {
        await refreshVisualAssets({ cancelled });
      } catch {}
    }

    void checkAssets();

    return () => {
      cancelled = true;
    };
  }, []);

  const combinedHits = buildCombinedHits(identifyState, visualState);

  async function runFromCanvas(sourceCanvas: HTMLCanvasElement) {
    const sourceUrl = canvasToDataUrl(sourceCanvas);
    setDetectionState({ status: "running" });
    setIdentifyState({ status: "idle" });
    setVisualState({ status: "idle" });

    try {
      const file = await canvasToFile(sourceCanvas);
      const bitmap = await createImageBitmap(file);
      const detection = await detectCardCorners(bitmap, modelFile);
      const overlayCanvas = drawDetectionOverlay(sourceCanvas, detection.corners);
      const cropCanvas = renderDetectionCrop(sourceCanvas, detection);
      cropCanvasRef.current = cropCanvas;

      setDetectionState({
        status: "done",
        sourceUrl,
        overlayUrl: canvasToDataUrl(overlayCanvas),
        cropUrl: canvasToDataUrl(cropCanvas),
        detection,
      });
    } catch (error) {
      setDetectionState({
        status: "error",
        sourceUrl,
        message:
          error instanceof Error
            ? error.message
            : "The ONNX detector failed to run on this frame.",
      });
    }
  }

  async function identifyCard() {
    const cropCanvas = cropCanvasRef.current;
    if (!cropCanvas || detectionState.status !== "done") return;

    setIdentifyState({ status: "running" });
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      try {
        const rawNameCanvas = cropRegion(cropCanvas, OCR_REGIONS.name, 3);
        const rawHpCanvas = cropRegion(cropCanvas, OCR_REGIONS.hp, 4);
        const rawNumberCanvas = cropRegion(cropCanvas, OCR_REGIONS.number, 5);

        const nameCanvas = preprocessStrip(rawNameCanvas, 150, 1.35);
        const hpCanvas = preprocessStrip(rawHpCanvas, 150, 1.45);
        const numberCanvas = preprocessStrip(rawNumberCanvas, 145, 1.55);

        const [rawName, rawHp, rawNumber] = await Promise.all([
          recognizeText(worker, nameCanvas, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,'-"),
          recognizeText(worker, hpCanvas, "HP0123456789 "),
          recognizeText(worker, numberCanvas, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ "),
        ]);

        const cardName = parseName(rawName);
        const hp = parseHp(rawHp);
        const cardNumber = parseCardNumber(rawNumber);

        if (!cardName && !hp && !cardNumber) {
          setIdentifyState({
            status: "error",
            message:
              "OCR could not read a usable name, HP, or card number from this capture. Try another photo with a flatter card and sharper text.",
          });
          return;
        }

        const response = await fetch("/api/scan/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardName, cardNumber, hp }),
        });

        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          throw new Error(
            bodyText
              ? `Search failed (${response.status}): ${bodyText}`
              : `Search failed (${response.status})`,
          );
        }

        const data = (await response.json()) as {
          candidates: CardsPageCardEntry[];
          confidence: "high" | "low";
        };

        setIdentifyState({
          status: "done",
          ocr: { cardName, hp, cardNumber, rawName, rawHp, rawNumber },
          preview: {
            nameStripUrl: canvasToDataUrl(nameCanvas),
            hpStripUrl: canvasToDataUrl(hpCanvas),
            numberStripUrl: canvasToDataUrl(numberCanvas),
          },
          candidates: data.candidates,
          confidence: data.confidence,
        });
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      setIdentifyState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not identify the card from the OCR strips.",
      });
    }
  }

  async function identifyCardVisually() {
    const cropCanvas = cropCanvasRef.current;
    if (!cropCanvas || detectionState.status !== "done") return;

    setVisualState((current) =>
      current.status === "idle" ? { status: "loading-assets" } : { status: "running" },
    );

    try {
      if (!embeddingIndexPromiseRef.current) {
        embeddingIndexPromiseRef.current = loadMobileClipEmbeddingIndex();
      }

      setVisualState({ status: "loading-assets" });
      const index = await embeddingIndexPromiseRef.current;
      setVisualState({ status: "running" });

      const startedAt = performance.now();
      const queryEmbedding = await embedImageWithMobileClip(cropCanvas);
      const inferenceMs = performance.now() - startedAt;
      const topMatches = searchMobileClipEmbeddingIndex(queryEmbedding, index, 6);

      setVisualState({
        status: "done",
        inferenceMs,
        topMatches,
        modelName: index.metadata.encoder.modelName,
        indexCount: index.metadata.count,
      });
    } catch (error) {
      setVisualState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not run MobileCLIP visual matching on this crop.",
      });
    }
  }

  async function runAllMatching() {
    await Promise.all([
      identifyCard(),
      visualAssetsState.status === "ready" ? identifyCardVisually() : Promise.resolve(),
    ]);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !cameraReady) return;
    const sourceCanvas = readGuideCrop(video);
    await runFromCanvas(sourceCanvas);
  }

  async function handlePhotoPick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setDetectionState({ status: "error", message: "Could not prepare the uploaded image." });
      return;
    }
    ctx.drawImage(bitmap, 0, 0);
    await runFromCanvas(canvas);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-[max(2rem,var(--bottom-nav-offset))] pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/50">
            Browser ONNX Scan
          </p>
          <h1 className="mt-1 text-xl font-semibold">Card Corner Detection Lab</h1>
        </div>
        <Link
          href="/search"
          className="rounded-full border border-[var(--foreground)]/15 px-3 py-2 text-sm text-[var(--foreground)]/72 transition hover:bg-[var(--foreground)]/6"
        >
          Back to Search
        </Link>
      </div>

      <div className="rounded-3xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/4 p-4">
        <p className="text-sm text-[var(--foreground)]/72">
          This is a clean browser-only scan lab. It captures one frame, sends it through
          <code className="mx-1 rounded bg-black/8 px-1 py-0.5 text-xs">onnxruntime-web</code>,
          and shows the detected card corners plus an unwarp preview. The default model is a merged
          single-file UVDoc ONNX model in
          <code className="mx-1 rounded bg-black/8 px-1 py-0.5 text-xs">public/models/card-corners.onnx</code>,
          and you can still swap in a local `.onnx` file from your device.
        </p>
      </div>

      <div
        className="relative overflow-hidden rounded-[1.75rem] border border-[var(--foreground)]/12 bg-black"
        style={{ aspectRatio: "3 / 4" }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onCanPlay={() => setCameraReady(true)}
          className="h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-[10%] inset-y-[8%] rounded-[1.25rem] border-2 border-white/75 shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" />
        </div>
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-4 py-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/65">
            Model Status
          </p>
          <p className="mt-1 text-sm">
            {cameraError
              ? cameraError
              : detectionState.status === "running"
                ? "Running the ONNX document unwarp model on the captured frame."
                : cameraReady
                  ? modelHint
                  : "Waiting for camera feed…"}
          </p>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-4 pt-12 text-white">
          <button
            type="button"
            onClick={() => void capture()}
            disabled={!cameraReady || detectionState.status === "running"}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition active:opacity-80 disabled:opacity-40"
          >
            Capture
          </button>
          <label className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition active:opacity-80">
            Use Photo
            <input type="file" accept="image/*" className="hidden" onChange={(event) => void handlePhotoPick(event)} />
          </label>
          <label className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition active:opacity-80">
            Load Model
            <input
              type="file"
              accept=".onnx"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                setModelFile(file);
                setModelHint(
                  file
                    ? `Loaded model: ${file.name}`
                    : "Default model: merged UVDoc at /models/card-corners.onnx",
                );
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void identifyCard()}
            disabled={
              detectionState.status !== "done" ||
              identifyState.status === "running" ||
              visualState.status === "running" ||
              visualState.status === "loading-assets"
            }
            className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition active:opacity-80 disabled:opacity-40"
          >
            {identifyState.status === "running" ? "Reading Card" : "Identify Card"}
          </button>
          <button
            type="button"
            onClick={() => void identifyCardVisually()}
            disabled={
              detectionState.status !== "done" ||
              visualAssetsState.status !== "ready" ||
              visualState.status === "loading-assets" ||
              visualState.status === "running"
            }
            className="rounded-full border border-cyan-300/35 bg-cyan-300/12 px-4 py-2 text-sm font-medium text-white transition active:opacity-80 disabled:opacity-40"
          >
            {visualState.status === "loading-assets"
              ? "Loading Visual Index"
              : visualState.status === "running"
                ? "Matching Visually"
                : "Visual Match"}
          </button>
          <button
            type="button"
            onClick={() => void runAllMatching()}
            disabled={
              detectionState.status !== "done" ||
              identifyState.status === "running" ||
              visualState.status === "loading-assets" ||
              visualState.status === "running"
            }
            className="rounded-full border border-emerald-300/35 bg-emerald-300/12 px-4 py-2 text-sm font-medium text-white transition active:opacity-80 disabled:opacity-40"
          >
            Run Both
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-3xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/4 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/50">
            Detection Output
          </p>

          {detectionState.status === "done" ? (
            <div className="mt-4 grid gap-4">
              <PreviewCard title="Captured Frame" src={detectionState.sourceUrl} aspectRatio="3 / 4" />
              <PreviewCard title="Corner Overlay" src={detectionState.overlayUrl} aspectRatio="3 / 4" />
              <PreviewCard
                title={detectionState.detection.outputMode === "remap-grid" ? "Unwarped Preview" : "Bounding Crop"}
                src={detectionState.cropUrl}
                aspectRatio="3 / 4"
              />
            </div>
          ) : detectionState.status === "error" ? (
            <div className="mt-4 grid gap-4">
              {detectionState.sourceUrl ? (
                <PreviewCard title="Captured Frame" src={detectionState.sourceUrl} aspectRatio="3 / 4" />
              ) : null}
              <p className="rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">
                {detectionState.message}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--foreground)]/58">
              Capture a frame and the page will try to run the ONNX model in-browser.
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/4 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/50">
            Run Notes
          </p>
          <dl className="mt-4 grid gap-3 text-sm">
            <DataRow label="Runtime">onnxruntime-web</DataRow>
            <DataRow label="Execution">wasm</DataRow>
            <DataRow label="Model">
              {modelFile?.name ?? "/models/card-corners.onnx"}
            </DataRow>
            <DataRow label="Output">
              {detectionState.status === "done" ? detectionState.detection.outputMode : "n/a"}
            </DataRow>
            <DataRow label="Camera">{cameraReady ? "ready" : "waiting"}</DataRow>
            <DataRow label="Status">{detectionState.status}</DataRow>
            <DataRow label="Visual Assets">
              {visualAssetsState.status === "ready"
                ? `${visualAssetsState.modelName} · ${visualAssetsState.indexCount.toLocaleString()}${visualAssetsState.smokeTest ? " demo" : ""}`
                : visualAssetsState.status}
            </DataRow>
            <DataRow label="Inference">
              {detectionState.status === "done"
                ? `${Math.round(detectionState.detection.inferenceMs)} ms`
                : "n/a"}
            </DataRow>
            <DataRow label="Input">
              {detectionState.status === "done"
                ? `${detectionState.detection.inputWidth} x ${detectionState.detection.inputHeight}`
                : "n/a"}
            </DataRow>
          </dl>

          {detectionState.status === "done" ? (
            <div className="mt-4 rounded-2xl border border-[var(--foreground)]/10 bg-black/8 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--foreground)]/50">
                Corners
              </p>
              <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-[var(--foreground)]/82">
                {JSON.stringify(detectionState.detection.corners, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/4 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/50">
          OCR + Matching
        </p>

        {identifyState.status === "idle" ? (
          <p className="mt-4 text-sm text-[var(--foreground)]/58">
            Once the unwarped card looks good, press <span className="font-medium">Identify Card</span>.
            The app will read the name, HP, and card number strips, then return likely matches.
          </p>
        ) : identifyState.status === "running" ? (
          <p className="mt-4 text-sm text-[var(--foreground)]/72">Reading OCR strips and matching cards…</p>
        ) : identifyState.status === "error" ? (
          <p className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">
            {identifyState.message}
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <PreviewCard title="Name Strip" src={identifyState.preview.nameStripUrl} aspectRatio="3 / 1" />
              <PreviewCard title="HP Strip" src={identifyState.preview.hpStripUrl} aspectRatio="2 / 1" />
              <PreviewCard title="Number Strip" src={identifyState.preview.numberStripUrl} aspectRatio="3 / 1" />
            </div>

            <div className="grid gap-2 text-sm">
              <DataRow label="OCR Name">{identifyState.ocr.cardName || "empty"}</DataRow>
              <DataRow label="OCR HP">{identifyState.ocr.hp || "empty"}</DataRow>
              <DataRow label="OCR Number">{identifyState.ocr.cardNumber || "empty"}</DataRow>
              <DataRow label="Confidence">{identifyState.confidence}</DataRow>
            </div>

            {identifyState.candidates.length === 0 ? (
              <p className="text-sm text-[var(--foreground)]/58">
                No likely match yet. Try another capture with a flatter card and clearer number strip.
              </p>
            ) : (
            <CardGrid
              cards={identifyState.candidates}
              customerLoggedIn={customerLoggedIn}
            />
            )}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/4 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/50">
          MobileCLIP Visual Match
        </p>

        {visualAssetsState.status === "missing" ? (
          <div className="mt-4 grid gap-3">
            <p className="rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
              {visualAssetsState.message}
            </p>
            <p className="text-sm text-[var(--foreground)]/58">
              Generate the MobileCLIP assets first, then reload this page to test visual matching.
            </p>
            <div>
              <button
                type="button"
                onClick={() => void refreshVisualAssets()}
                className="rounded-full border border-[var(--foreground)]/15 px-3 py-2 text-sm text-[var(--foreground)]/72 transition hover:bg-[var(--foreground)]/6"
              >
                Re-check Assets
              </button>
            </div>
          </div>
        ) : visualState.status === "idle" ? (
          <div className="mt-4 grid gap-3">
            {visualAssetsState.status === "ready" && visualAssetsState.smokeTest ? (
              <p className="rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
                The current embedding index is a smoke-test demo built from local placeholder
                images. The full card catalog index still needs to be generated for meaningful
                recognition.
              </p>
            ) : null}
            <p className="text-sm text-[var(--foreground)]/58">
              This path uses the unwarped card crop as a full-image embedding query instead of OCR.
              It will load the MobileCLIP ONNX model and the precomputed card embedding index when
              you press <span className="font-medium">Visual Match</span>.
            </p>
          </div>
        ) : visualState.status === "loading-assets" ? (
          <p className="mt-4 text-sm text-[var(--foreground)]/72">
            Loading the MobileCLIP model and precomputed embedding index…
          </p>
        ) : visualState.status === "running" ? (
          <p className="mt-4 text-sm text-[var(--foreground)]/72">
            Embedding the crop and running cosine similarity search…
          </p>
        ) : visualState.status === "error" ? (
          <p className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">
            {visualState.message}
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2 text-sm">
              <DataRow label="Encoder">{visualState.modelName}</DataRow>
              <DataRow label="Index Size">{visualState.indexCount.toLocaleString()} cards</DataRow>
              <DataRow label="Query Time">{`${Math.round(visualState.inferenceMs)} ms`}</DataRow>
            </div>

            {visualState.topMatches.length === 0 ? (
              <p className="text-sm text-[var(--foreground)]/58">
                The visual index loaded, but it did not return any matches for this crop.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visualState.topMatches.map((match) => (
                  <Link
                    key={`${match.card.masterCardId ?? match.index}-${match.index}`}
                    href={`/cards?search=${encodeURIComponent(match.card.cardName ?? "")}`}
                    className="overflow-hidden rounded-2xl border border-cyan-400/18 bg-cyan-400/4 transition hover:bg-cyan-400/8"
                  >
                    <div className="relative aspect-[3/4] bg-black/10">
                      <Image
                        src={resolveMediaURL(match.card.image)}
                        alt={match.card.cardName ?? "Matched card"}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                    <div className="grid gap-1 px-3 py-3 text-sm">
                      <p className="font-medium">{match.card.cardName || "Unknown card"}</p>
                      <p className="text-[var(--foreground)]/58">
                        {match.card.cardNumber || "No number"} · {match.card.setCode || "Unknown set"}
                      </p>
                      <p className="font-mono text-[12px] text-cyan-200/80">
                        cosine {match.score.toFixed(4)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/4 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/50">
          Combined Candidates
        </p>

        {combinedHits.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--foreground)]/58">
            Run OCR, visual match, or both, and this panel will combine the strongest candidates in
            one shortlist.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {combinedHits.map((hit) => (
              <Link
                key={hit.key}
                href={hit.href}
                className="overflow-hidden rounded-2xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/3 transition hover:bg-[var(--foreground)]/6"
              >
                <div className="relative aspect-[3/4] bg-black/10">
                  <Image src={hit.imageSrc} alt={hit.cardName} fill unoptimized className="object-cover" />
                </div>
                <div className="grid gap-1 px-3 py-3 text-sm">
                  <p className="font-medium">{hit.cardName}</p>
                  <p className="text-[var(--foreground)]/58">
                    {hit.cardNumber} · {hit.setLabel}
                  </p>
                  <p className="font-mono text-[12px] text-[var(--foreground)]/48">
                    {hit.sources.join(" + ")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function PreviewCard({
  title,
  src,
  aspectRatio,
}: {
  title: string;
  src: string;
  aspectRatio: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/50">
        {title}
      </p>
      <div
        className="relative mt-2 overflow-hidden rounded-2xl border border-[var(--foreground)]/10 bg-black/8"
        style={{ aspectRatio }}
      >
        <Image src={src} alt={title} fill unoptimized className="object-contain" />
      </div>
    </div>
  );
}

function DataRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[var(--foreground)]/48">{label}</dt>
      <dd className="max-w-[65%] text-right font-mono text-[13px] text-[var(--foreground)]/82">
        {children}
      </dd>
    </div>
  );
}
