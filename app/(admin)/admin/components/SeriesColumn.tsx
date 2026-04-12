"use client";

type SeriesColumnProps = {
  brand: "pokemon" | "onepiece";
  seriesNames: string[];
  selected: string | null;
  onSelect: (seriesName: string) => void;
};

export function SeriesColumn({ seriesNames, selected, onSelect }: SeriesColumnProps) {
  return (
    <div className="flex h-full w-44 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
      <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
        Series
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {seriesNames.map((name) => (
          <li key={name}>
            <button
              onClick={() => onSelect(name)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                selected === name
                  ? "bg-blue-500 text-white hover:bg-blue-500 dark:hover:bg-blue-500"
                  : ""
              }`}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
