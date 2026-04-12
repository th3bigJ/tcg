"use client";

type FieldEditorProps = {
  fieldName: string;
  value: unknown;
  onChange: (value: unknown) => void;
};

const NUMBER_FIELDS = new Set([
  "hp", "retreatCost", "cost", "power", "counter", "life",
  "cardCountTotal", "cardCountOfficial", "cardCount",
]);

const DATE_FIELDS = new Set(["releaseDate"]);

export function FieldEditor({ fieldName, value, onChange }: FieldEditorProps) {
  const inputClass =
    "w-full rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-600";

  if (value === null || value === undefined) {
    return (
      <input
        type="text"
        className={inputClass}
        value=""
        placeholder="null"
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  }

  if (Array.isArray(value)) {
    const display = value
      .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
      .join(", ");
    return (
      <textarea
        className={inputClass + " min-h-[60px] resize-y font-mono text-xs"}
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw.trim()) {
            onChange([]);
            return;
          }
          // Try to detect JSON objects vs plain strings/numbers
          const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
          const parsed = parts.map((p) => {
            const n = Number(p);
            if (!isNaN(n) && p !== "") return n;
            try {
              return JSON.parse(p);
            } catch {
              return p;
            }
          });
          onChange(parsed);
        }}
      />
    );
  }

  if (typeof value === "object") {
    return (
      <textarea
        className={inputClass + " min-h-[80px] resize-y font-mono text-xs"}
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            // Keep raw string while user is typing
            onChange(e.target.value);
          }
        }}
      />
    );
  }

  if (typeof value === "boolean") {
    return (
      <select
        className={inputClass}
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "true")}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (DATE_FIELDS.has(fieldName)) {
    const dateVal = typeof value === "string" ? value.slice(0, 10) : "";
    return (
      <input
        type="date"
        className={inputClass}
        value={dateVal}
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  }

  if (NUMBER_FIELDS.has(fieldName) || typeof value === "number") {
    return (
      <input
        type="number"
        className={inputClass}
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    );
  }

  return (
    <input
      type="text"
      className={inputClass}
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
