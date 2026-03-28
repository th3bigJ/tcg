"use client";

import Image from "next/image";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import type { ScanState } from "@/lib/hooks/useCardScan";
import {
  DEFAULT_SCAN_OCR_SETTINGS,
  SCAN_REGIONS,
  isCardFullyInView,
  type ScanOcrSettings,
} from "@/lib/scanOcr";

type Props = {
  onFile: (file: File, scanSettings?: Partial<ScanOcrSettings>) => void;
  onBurst: (files: File[], scanSettings?: Partial<ScanOcrSettings>) => void;
  onReset: () => void;
  disabled: boolean;
  state: ScanState;
};

type FacingMode = "environment" | "user";
const AUTO_SCAN_INTERVAL_MS = 1800;
const BURST_COUNT = 3;
const BURST_FRAME_DELAY_MS = 1000;

export function ScanUploadZone({ onFile, onBurst, onReset, disabled, state }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoScanTimeoutRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [startingCamera, setStartingCamera] = useState(true);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [cardInView, setCardInView] = useState(false);
  const [burstModeActive, setBurstModeActive] = useState(false);
  const [scanSettings, setScanSettings] = useState<ScanOcrSettings>({
    ...DEFAULT_SCAN_OCR_SETTINGS,
  });

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      setStartingCamera(true);
      setCameraReady(false);
      setCameraError("");

      try {
        stopCamera();

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser does not expose camera access.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
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
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to access the camera.";
        setCameraError(message);
      } finally {
        if (!cancelled) {
          setStartingCamera(false);
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      clearAutoScanTimeout();
      stopCamera();
    };
  }, [cameraAttempt, facingMode]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function clearAutoScanTimeout() {
    if (autoScanTimeoutRef.current !== null) {
      window.clearTimeout(autoScanTimeoutRef.current);
      autoScanTimeoutRef.current = null;
    }
  }

  async function makeFrameFile() {
    const video = videoRef.current;
    if (!video || disabled || !cameraReady) return null;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.95),
    );
    if (!blob) return null;

    return new File([blob], `scan-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }

  async function captureFrame(trigger: "manual" | "auto" = "manual") {
    clearAutoScanTimeout();
    const file = await makeFrameFile();
    if (!file) return;

    setLastScanAt(Date.now());
    if (trigger === "manual") {
      setAutoScanEnabled(false);
    }

    onFile(file, scanSettings);
  }

  async function captureBurst() {
    if (burstModeActive || disabled) return;
    clearAutoScanTimeout();
    setBurstModeActive(true);

    try {
      const frames: File[] = [];
      for (let i = 0; i < BURST_COUNT; i++) {
        const file = await makeFrameFile();
        if (file) {
          frames.push(file);
        }
        if (i < BURST_COUNT - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, BURST_FRAME_DELAY_MS));
        }
      }

      if (frames.length > 0) {
        setLastScanAt(Date.now());
        onBurst(frames, scanSettings);
      }
    } finally {
      setBurstModeActive(false);
    }
  }

  const checkCardInView = useEffectEvent(async () => {
    if (!autoScanEnabled || disabled || !cameraReady || burstModeActive) {
      setCardInView(false);
      return;
    }

    const probe = await makeFrameFile();
    if (!probe) {
      setCardInView(false);
      return;
    }

    const inView = await isCardFullyInView(probe).catch(() => false);
    setCardInView(inView);
    if (inView) {
      await captureBurst();
    }
  });

  const queueAutoScan = useEffectEvent(() => {
    clearAutoScanTimeout();

    if (!autoScanEnabled || disabled || !cameraReady || cameraError || burstModeActive) {
      return;
    }

    autoScanTimeoutRef.current = window.setTimeout(() => {
      void checkCardInView();
    }, AUTO_SCAN_INTERVAL_MS);
  });

  useEffect(() => {
    queueAutoScan();
    return clearAutoScanTimeout;
  }, [state.status, autoScanEnabled, disabled, cameraReady, cameraError]);

  function statusText() {
    if (cameraError) return cameraError;
    if (burstModeActive) return "Card framed. Capturing a 3-shot burst now.";
    if (state.status === "processing") return "Processing the burst to find the strongest frame.";
    if (state.status === "searching") return "Searching the card database with the extracted text.";
    if (state.status === "results") {
      return autoScanEnabled
        ? "Match updated. Live scanning will keep checking the next frame."
        : "Latest scan complete. Live scanning is paused.";
    }
    if (state.status === "error") return state.message;
    if (startingCamera) return "Starting rear camera…";
    if (!cameraReady) return "Waiting for camera feed…";
    return autoScanEnabled
      ? cardInView
        ? "Card fully in view. Burst capture is armed."
        : "Live camera ready. Hold the full card inside the frame to trigger a 3-shot burst."
      : "Live camera ready. Auto-scan is paused.";
  }

  const showDebug = state.status !== "idle";

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative w-full overflow-hidden rounded-[1.5rem] border border-[var(--foreground)]/15 bg-black"
        style={{ aspectRatio: "3 / 4" }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover"
          onCanPlay={() => setCameraReady(true)}
        />

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent_0,transparent_calc(33.333%-0.5px),rgba(255,255,255,0.18)_calc(33.333%-0.5px),rgba(255,255,255,0.18)_calc(33.333%+0.5px),transparent_calc(33.333%+0.5px),transparent_calc(66.666%-0.5px),rgba(255,255,255,0.18)_calc(66.666%-0.5px),rgba(255,255,255,0.18)_calc(66.666%+0.5px),transparent_calc(66.666%+0.5px))]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0,transparent_calc(25%-0.5px),rgba(255,255,255,0.14)_calc(25%-0.5px),rgba(255,255,255,0.14)_calc(25%+0.5px),transparent_calc(25%+0.5px),transparent_calc(50%-0.5px),rgba(255,255,255,0.14)_calc(50%-0.5px),rgba(255,255,255,0.14)_calc(50%+0.5px),transparent_calc(50%+0.5px),transparent_calc(75%-0.5px),rgba(255,255,255,0.14)_calc(75%-0.5px),rgba(255,255,255,0.14)_calc(75%+0.5px),transparent_calc(75%+0.5px))]" />
          <div className="absolute inset-x-[10%] inset-y-[6%] rounded-[1.25rem] border-2 border-white/75 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />

          <ScanBand
            label={SCAN_REGIONS.name.label}
            top={SCAN_REGIONS.name.yStart * 100}
            height={(scanSettings.nameBandEnd - SCAN_REGIONS.name.yStart) * 100}
            tone="amber"
          />
          <ScanBand
            label={SCAN_REGIONS.hp.label}
            top={SCAN_REGIONS.hp.yStart * 100}
            height={(SCAN_REGIONS.hp.yEnd - SCAN_REGIONS.hp.yStart) * 100}
            tone="emerald"
            left={SCAN_REGIONS.hp.xStart * 100}
            width={(SCAN_REGIONS.hp.xEnd - SCAN_REGIONS.hp.xStart) * 100}
          />
          <ScanBand
            label={SCAN_REGIONS.number.label}
            top={scanSettings.bottomBandStart * 100}
            height={(SCAN_REGIONS.number.yEnd - scanSettings.bottomBandStart) * 100}
            tone="cyan"
          />
        </div>

        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 to-transparent px-4 py-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">
            Scanner Debug
          </p>
          <p className="mt-1 max-w-[24rem] text-sm font-medium leading-5">{statusText()}</p>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-4 pt-10 text-white">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void captureFrame("manual")}
              disabled={disabled || !cameraReady}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition active:opacity-80 disabled:opacity-40"
            >
              Scan Once
            </button>
            <button
              type="button"
              onClick={() => setAutoScanEnabled((current) => !current)}
              className="rounded-full border border-white/25 bg-emerald-400/20 px-4 py-2 text-sm font-medium text-white transition active:opacity-80"
            >
              {autoScanEnabled ? "Pause Auto" : "Resume Auto"}
            </button>
            <button
              type="button"
              onClick={() =>
                setFacingMode((current) =>
                  current === "environment" ? "user" : "environment",
                )
              }
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition active:opacity-80"
            >
              Flip Camera
            </button>
            <button
              type="button"
              onClick={() => setCameraAttempt((current) => current + 1)}
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition active:opacity-80"
            >
              Retry Camera
            </button>
            {showDebug ? (
              <button
                type="button"
                onClick={onReset}
                className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white transition active:opacity-80"
              >
                Clear Debug
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/55">
            OCR Dev Tools
          </p>
          <div className="mt-3 grid gap-2 text-sm">
            <DebugRow label="Camera">
              {cameraError
                ? "error"
                : startingCamera
                  ? "starting"
                  : cameraReady
                    ? "live"
                    : "waiting"}
            </DebugRow>
            <DebugRow label="Lens">{facingMode}</DebugRow>
            <DebugRow label="Auto scan">{autoScanEnabled ? "on" : "paused"}</DebugRow>
            <DebugRow label="Card in view">{cardInView ? "yes" : "no"}</DebugRow>
            <DebugRow label="Burst">{burstModeActive ? "capturing" : "idle"}</DebugRow>
            <DebugRow label="Last scan">
              {lastScanAt ? new Date(lastScanAt).toLocaleTimeString() : "waiting"}
            </DebugRow>
            <DebugRow label="Name band">
              {Math.round(SCAN_REGIONS.name.yStart * 100)}% to {Math.round(scanSettings.nameBandEnd * 100)}%
            </DebugRow>
            <DebugRow label="HP band">
              {Math.round(SCAN_REGIONS.hp.xStart * 100)}% to {Math.round(SCAN_REGIONS.hp.xEnd * 100)}% x{" "}
              {Math.round(SCAN_REGIONS.hp.yStart * 100)}% to {Math.round(SCAN_REGIONS.hp.yEnd * 100)}%
            </DebugRow>
            <DebugRow label="Number band">
              {Math.round(scanSettings.bottomBandStart * 100)}% to {Math.round(SCAN_REGIONS.number.yEnd * 100)}%
            </DebugRow>
            <DebugRow label="OCR name">
              {showDebug && "ocrResult" in state ? state.ocrResult.cardName || "empty" : "waiting"}
            </DebugRow>
            <DebugRow label="OCR number">
              {showDebug && "ocrResult" in state ? state.ocrResult.cardNumber || "empty" : "waiting"}
            </DebugRow>
            <DebugRow label="OCR artist">
              {showDebug && "ocrResult" in state ? state.ocrResult.artist || "empty" : "waiting"}
            </DebugRow>
            <DebugRow label="OCR HP">
              {showDebug && "ocrResult" in state ? state.ocrResult.hp || "empty" : "waiting"}
            </DebugRow>
            <DebugRow label="Matches">
              {state.status === "results" ? String(state.candidates.length) : "waiting"}
            </DebugRow>
            <DebugRow label="Confidence">
              {state.status === "results" ? state.confidence : "waiting"}
            </DebugRow>
          </div>

          <div className="mt-4 grid gap-4 rounded-xl border border-[var(--foreground)]/10 bg-black/5 p-3">
            <SliderControl
              label="Name Band End"
              value={Math.round(scanSettings.nameBandEnd * 100)}
              min={14}
              max={32}
              onChange={(value) =>
                setScanSettings((current) => ({ ...current, nameBandEnd: value / 100 }))
              }
              suffix="%"
            />
            <SliderControl
              label="Bottom Band Start"
              value={Math.round(scanSettings.bottomBandStart * 100)}
              min={62}
              max={88}
              onChange={(value) =>
                setScanSettings((current) => ({ ...current, bottomBandStart: value / 100 }))
              }
              suffix="%"
            />
            <SliderControl
              label="B/W Threshold"
              value={Math.round(scanSettings.threshold)}
              min={80}
              max={220}
              onChange={(value) =>
                setScanSettings((current) => ({ ...current, threshold: value }))
              }
            />
            <SliderControl
              label="Contrast"
              value={scanSettings.contrast}
              min={0.8}
              max={2.2}
              step={0.05}
              onChange={(value) =>
                setScanSettings((current) => ({ ...current, contrast: value }))
              }
            />
          </div>

          {showDebug && "ocrResult" in state ? (
            <details className="mt-4 rounded-xl border border-[var(--foreground)]/10 bg-black/5 p-3">
              <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/55">
                Raw OCR Text
              </summary>
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-[var(--foreground)]/78">
                {state.ocrResult.rawText || "No text extracted."}
              </pre>
            </details>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/55">
            Last Frame
          </p>
          <div
            className="relative mt-3 overflow-hidden rounded-xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/6"
            style={{ aspectRatio: "2 / 3" }}
          >
            {"preview" in state && state.preview ? (
              <Image
                src={state.preview}
                alt="Last captured frame"
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[var(--foreground)]/45">
                Captured frame preview appears here after each scan.
              </div>
            )}
          </div>
        </div>

        {showDebug && "ocrResult" in state ? (
          <div className="rounded-2xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-3 sm:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--foreground)]/55">
              OCR Strip Previews
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <DebugImageCard
                label="Source"
                src={state.ocrResult.debugImages.source}
                alt="Source frame used for OCR"
                aspectRatio="2 / 3"
              />
              <DebugImageCard
                label="Detection Overlay"
                src={state.ocrResult.debugImages.detectionOverlay}
                alt="Detected card bounds overlay"
                aspectRatio="2 / 3"
              />
              <DebugImageCard
                label="Detected Card"
                src={state.ocrResult.debugImages.detectedCard}
                alt="Perspective-corrected card crop"
                aspectRatio="2 / 3"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DebugImageCard
                label="Name + HP Strip"
                src={state.ocrResult.debugImages.nameStrip}
                alt="Processed OCR name strip"
                aspectRatio="3 / 1"
              />
              <DebugImageCard
                label="HP Strip"
                src={state.ocrResult.debugImages.hpStrip}
                alt="Processed OCR HP strip"
                aspectRatio="2 / 1"
              />
              <DebugImageCard
                label="Artist + Number Strip"
                src={state.ocrResult.debugImages.numberStrip}
                alt="Processed OCR number strip"
                aspectRatio="3 / 1"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScanBand({
  label,
  top,
  height,
  tone,
  left,
  width,
}: {
  label: string;
  top: number;
  height: number;
  tone: "amber" | "cyan" | "emerald";
  left?: number;
  width?: number;
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-300/80 bg-amber-300/10 text-amber-100"
      : tone === "cyan"
        ? "border-cyan-300/80 bg-cyan-300/10 text-cyan-100"
        : "border-emerald-300/80 bg-emerald-300/10 text-emerald-100";

  return (
    <div
      className={`absolute rounded-lg border ${toneClasses}`}
      style={{
        top: `${top}%`,
        height: `${height}%`,
        left: `${left ?? 13}%`,
        width: `${width ?? 74}%`,
      }}
    >
      <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </span>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  onChange,
  step = 1,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--foreground)]/62">{label}</span>
        <span className="font-mono text-sm text-[var(--foreground)]/85">
          {step < 1 ? value.toFixed(2) : Math.round(value)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-white"
      />
    </label>
  );
}

function DebugRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--foreground)]/48">{label}</span>
      <span className="max-w-[65%] text-right font-mono text-[13px] text-[var(--foreground)]/82">
        {children}
      </span>
    </div>
  );
}

function DebugImageCard({
  label,
  src,
  alt,
  aspectRatio,
}: {
  label: string;
  src: string;
  alt: string;
  aspectRatio: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/4 p-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/55">
        {label}
      </p>
      <div className="relative mt-2 overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-black/5" style={{ aspectRatio }}>
        <Image src={src} alt={alt} fill unoptimized className="object-cover" />
      </div>
    </div>
  );
}
