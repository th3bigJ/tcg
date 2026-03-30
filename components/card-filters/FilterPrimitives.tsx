"use client";

import type { ReactNode } from "react";

type FilterChipButtonProps = {
  label: string;
  active: boolean;
  icon?: ReactNode;
  onClick: () => void;
};

export function FilterChipButton({ label, active, icon, onClick }: FilterChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
        active
          ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
          : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/75 hover:border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/12 hover:text-[var(--foreground)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

type FilterClearChipProps = {
  onClick: () => void;
};

export function FilterClearChip({ onClick }: FilterClearChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-400/40 bg-red-500/12 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 active:scale-95"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
      Clear filters
    </button>
  );
}

export function FilterChevronDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-55"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

type FilterChipSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  defaultValue?: string;
  widthClass?: string;
};

export function FilterChipSelect({
  value,
  onChange,
  options,
  ariaLabel,
  defaultValue,
  widthClass = "w-28",
}: FilterChipSelectProps) {
  const active = defaultValue !== undefined ? value !== defaultValue : Boolean(value);
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        aria-label={ariaLabel}
        className={`h-8 ${widthClass} rounded-full border py-0 pl-3 pr-7 text-xs font-medium transition [appearance:none] [-webkit-appearance:none] [background-image:none] outline-none ${
          active
            ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
            : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/75 hover:border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/12"
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FilterChevronDown />
    </div>
  );
}

type FilterSearchInputProps = {
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
};

export function FilterSearchInput({
  defaultValue,
  value,
  onChange,
  name = "search",
}: FilterSearchInputProps) {
  return (
    <div className="relative flex-1">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--foreground)]/45"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (e) => onChange(e.currentTarget.value) : undefined}
        placeholder="Search cards…"
        aria-label="Search cards"
        className="w-full rounded-full border border-[var(--foreground)]/20 bg-[var(--foreground)]/6 py-2 pl-8 pr-3 text-sm outline-none transition focus:border-[var(--foreground)]/35 focus:ring-2 focus:ring-[var(--foreground)]/15"
      />
    </div>
  );
}

type FilterRoundIconButtonProps = {
  label: string;
  onClick?: () => void;
  children: ReactNode;
};

export function FilterRoundIconButton({
  label,
  onClick,
  children,
}: FilterRoundIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/70 transition hover:bg-[var(--foreground)]/14"
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function FilterControlsShell({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-col gap-6">{children}</div>;
}

export function FilterChipRow({ children }: { children: ReactNode }) {
  return <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-0.5">{children}</div>;
}
