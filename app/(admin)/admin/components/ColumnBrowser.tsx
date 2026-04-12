"use client";

import { BrandColumn } from "./BrandColumn";
import { SeriesColumn } from "./SeriesColumn";
import { SetsColumn } from "./SetsColumn";
import { CardsColumn } from "./CardsColumn";

type AdminSelection = {
  brand: "pokemon" | "onepiece" | null;
  seriesName: string | null;
  setCode: string | null;
  cardId: string | null;
};

type SetItem = { id: string; name: string; setCode?: string; setKey?: string; seriesName?: string | null };
type CardItem = { masterCardId?: string; priceKey?: string; cardName?: string; name?: string; cardNumber?: string; rarity?: string | null };

type ColumnBrowserProps = {
  selection: AdminSelection;
  pokemonSets: SetItem[] | null;
  onepieceSets: SetItem[] | null;
  cardsBySet: Map<string, CardItem[]>;
  cardsLoading: boolean;
  onSelectBrand: (brand: "pokemon" | "onepiece") => void;
  onSelectSeries: (seriesName: string, item: Record<string, unknown>) => void;
  onSelectSet: (setCode: string, item: Record<string, unknown>) => void;
  onSelectCard: (cardId: string, item: Record<string, unknown>) => void;
};

export function ColumnBrowser({
  selection,
  pokemonSets,
  onepieceSets,
  cardsBySet,
  cardsLoading,
  onSelectBrand,
  onSelectSeries,
  onSelectSet,
  onSelectCard,
}: ColumnBrowserProps) {
  const seriesNames: string[] = [];
  const filteredSets: SetItem[] = [];

  if (selection.brand === "pokemon" && pokemonSets) {
    const seen = new Set<string>();
    for (const s of pokemonSets) {
      const sn = s.seriesName ?? "Other";
      if (!seen.has(sn)) {
        seen.add(sn);
        seriesNames.push(sn);
      }
    }
    if (selection.seriesName) {
      filteredSets.push(
        ...pokemonSets.filter((s) => (s.seriesName ?? "Other") === selection.seriesName),
      );
    }
  } else if (selection.brand === "onepiece" && onepieceSets) {
    // One Piece: skip series level, put all sets in a single "All Sets" group
    seriesNames.push("All Sets");
    if (selection.seriesName) {
      filteredSets.push(...onepieceSets);
    }
  }

  const cacheKey = selection.brand && selection.setCode
    ? `${selection.brand}:${selection.setCode}`
    : null;
  const cards = cacheKey ? (cardsBySet.get(cacheKey) ?? []) : [];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex h-full flex-row overflow-x-auto">
        <BrandColumn selected={selection.brand} onSelect={onSelectBrand} />

        {selection.brand && seriesNames.length > 0 && (
          <SeriesColumn
            brand={selection.brand}
            seriesNames={seriesNames}
            selected={selection.seriesName}
            onSelect={(name) =>
              onSelectSeries(name, { seriesName: name, brand: selection.brand })
            }
          />
        )}

        {selection.seriesName && filteredSets.length > 0 && (
          <SetsColumn
            sets={filteredSets}
            selected={selection.setCode}
            onSelect={onSelectSet}
          />
        )}

        {selection.setCode && (
          <CardsColumn
            cards={cards}
            loading={cardsLoading}
            selected={selection.cardId}
            onSelect={onSelectCard}
          />
        )}
      </div>
    </div>
  );
}
