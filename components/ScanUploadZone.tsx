"use client";

import { useRef } from "react";

type Props = {
  onFile: (file: File) => void;
  disabled: boolean;
  preview?: string;
};

export function ScanUploadZone({ onFile, disabled, preview }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onFile(file);
      // reset so the same file can be re-selected
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Card-shaped preview / placeholder */}
      <div
        className="relative w-full max-w-xs overflow-hidden rounded-xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/5"
        style={{ aspectRatio: "2 / 3" }}
      >
        {preview ? (
          <img
            src={preview}
            alt="Card preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-[var(--foreground)]/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-12 w-12"
              aria-hidden="true"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            <p className="text-sm font-medium">Point camera at a card</p>
            <p className="text-xs">Works best in good lighting. Hold the card flat to reduce glare.</p>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex w-full max-w-xs gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--foreground)] px-4 py-3 text-sm font-semibold text-[var(--background)] transition active:opacity-80 disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          Take photo
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => libraryRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--foreground)]/20 bg-[var(--foreground)]/8 px-4 py-3 text-sm font-semibold transition active:opacity-80 disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Upload
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
