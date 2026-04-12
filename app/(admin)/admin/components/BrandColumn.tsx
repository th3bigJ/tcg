"use client";

type BrandColumnProps = {
  selected: "pokemon" | "onepiece" | null;
  onSelect: (brand: "pokemon" | "onepiece") => void;
};

const BRANDS: { id: "pokemon" | "onepiece"; label: string }[] = [
  { id: "pokemon", label: "Pokemon" },
  { id: "onepiece", label: "One Piece" },
];

export function BrandColumn({ selected, onSelect }: BrandColumnProps) {
  return (
    <div className="flex h-full w-40 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
      <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
        Brand
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {BRANDS.map(({ id, label }) => (
          <li key={id}>
            <button
              onClick={() => onSelect(id)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                selected === id
                  ? "bg-blue-500 text-white hover:bg-blue-500 dark:hover:bg-blue-500"
                  : ""
              }`}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
