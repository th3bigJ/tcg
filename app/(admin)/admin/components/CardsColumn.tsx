"use client";

type CardItem = {
  masterCardId?: string;
  priceKey?: string;
  cardName?: string;
  name?: string;
  cardNumber?: string;
  rarity?: string | null;
};

type CardsColumnProps = {
  cards: CardItem[];
  loading: boolean;
  selected: string | null; // masterCardId or priceKey
  onSelect: (cardId: string, item: Record<string, unknown>) => void;
};

export function CardsColumn({ cards, loading, selected, onSelect }: CardsColumnProps) {
  return (
    <div className="flex h-full w-52 shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-700">
      <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
        Cards
        {!loading && <span className="ml-1 font-normal text-neutral-400">({cards.length})</span>}
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-xs text-neutral-400">
          Loading…
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {cards.map((card) => {
            const id = card.masterCardId ?? card.priceKey ?? "";
            const displayName = card.cardName ?? card.name ?? id;
            return (
              <li key={id}>
                <button
                  onClick={() => onSelect(id, card as Record<string, unknown>)}
                  className={`w-full px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                    selected === id
                      ? "bg-blue-500 text-white hover:bg-blue-500 dark:hover:bg-blue-500"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {card.cardNumber && (
                      <span className={`text-xs font-mono ${selected === id ? "text-blue-200" : "text-neutral-400"}`}>
                        {card.cardNumber}
                      </span>
                    )}
                    <span className="truncate text-xs">{displayName}</span>
                  </div>
                  {card.rarity && (
                    <div className={`truncate text-xs ${selected === id ? "text-blue-200" : "text-neutral-400"}`}>
                      {card.rarity}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
