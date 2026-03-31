"use client";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import type { SearchCardDataPayload } from "@/lib/searchCardDataServer";

type Props = {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  setSymbolsByCode?: Record<string, string>;
  customerLoggedIn: boolean;
  formAction: string;
  extraHiddenFields?: Record<string, string>;
  activeSearch: string;
  activeSet: string;
  activePokemon: string;
  activeRarity: string;
  activeEnergy: string;
  activeCategory: string;
  excludeCommonUncommon: boolean;
  rarityOptions: string[];
  energyOptions: string[];
  categoryOptions: string[];
  resetHref: string;
  initialSearchCardData?: SearchCardDataPayload | null;
};

export function SearchCardsTabGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
  initialSearchCardData,
}: Props) {
  const cardData = customerLoggedIn ? initialSearchCardData ?? null : null;

  return (
    <CardGrid
      cards={cards}
      setLogosByCode={setLogosByCode}
      setSymbolsByCode={setSymbolsByCode}
      customerLoggedIn={customerLoggedIn}
      itemConditions={cardData?.itemConditions}
      wishlistEntryIdsByMasterCardId={cardData?.wishlistMap}
      collectionLinesByMasterCardId={cardData?.collectionLines}
      groupBySet={false}
    />
  );
}
