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

const VIEWPORT_ASPECT = 3 / 4;
const GUIDE = {
  left: 0.1,
  right: 0.9,
  top: 0.06,
  bottom: 0.94,
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

export function OnnxScanLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelHint, setModelHint] = useState("Default model: UVDoc remap grid at /models/card-corners.onnx");
  const [detectionState, setDetectionState] = useState<DetectionState>({ status: "idle" });

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

  async function runFromCanvas(sourceCanvas: HTMLCanvasElement) {
    const sourceUrl = canvasToDataUrl(sourceCanvas);
    setDetectionState({ status: "running" });

    try {
      const file = await canvasToFile(sourceCanvas);
      const bitmap = await createImageBitmap(file);
      const detection = await detectCardCorners(bitmap, modelFile);
      const overlayCanvas = drawDetectionOverlay(sourceCanvas, detection.corners);
      const cropCanvas = renderDetectionCrop(sourceCanvas, detection);

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

  async function capture() {
    const video = videoRef.current;
    if (!video || !cameraReady) return;
    const sourceCanvas = readGuideCrop(video);
    await runFromCanvas(sourceCanvas);
  }

  async function handlePhotoPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
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
    event.currentTarget.value = "";
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
          and shows the detected card corners plus an unwarp preview. The default model is the free
          UVDoc ONNX remap-grid model in
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
          <div className="absolute inset-x-[10%] inset-y-[6%] rounded-[1.25rem] border-2 border-white/75 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
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
                    : "Default model: UVDoc remap grid at /models/card-corners.onnx",
                );
              }}
            />
          </label>
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
        <Image src={src} alt={title} fill unoptimized className="object-cover" />
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
