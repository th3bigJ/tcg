"use client";

type SetItem = {
  id: string;
  name: string;
  setCode?: string;
  setKey?: string;
};

type SetsColumnProps = {
  sets: SetItem[];
  selected: string | null; // setCode or setKey
  onSelect: (setCode: string, item: Record<string, unknown>) => void;
};

export function SetsColumn({ sets, selected, onSelect }: SetsColumnProps) {
  return (
    <div className="flex h-full w-44 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
      <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
        Sets
        <span className="ml-1 font-normal text-neutral-400">({sets.length})</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {sets.map((set) => {
          const code = set.setCode ?? set.setKey ?? set.id;
          return (
            <li key={set.id}>
              <button
                onClick={() => onSelect(code, set as Record<string, unknown>)}
                className={`w-full px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  selected === code
                    ? "bg-blue-500 text-white hover:bg-blue-500 dark:hover:bg-blue-500"
                    : ""
                }`}
              >
                <div className="text-xs font-medium">{code}</div>
                <div className={`truncate text-xs ${selected === code ? "text-blue-100" : "text-neutral-500"}`}>
                  {set.name}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
