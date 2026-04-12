"use client";

import { useEffect, useRef, useState } from "react";
import {
  adminBrandSupportsSetCardSave,
  adminCardsFetchPath,
  adminPricingFetchPath,
  adminSetsFetchPath,
} from "@/lib/adminBrandDataRoutes";
import { DetailPane, type SelectedItemKind } from "./components/DetailPane";
import { ScraperPanel } from "./components/ScraperPanel";

type Brand = string;

type AdminSelection = {
  brand: Brand | null;
  seriesName: string | null;
  setCode: string | null;
  cardId: string | null;
};

type SetItem = {
  id: string;
  name: string;
  setCode?: string;
  setKey?: string;
  seriesName?: string | null;
  [key: string]: unknown;
};

type CardItem = {
  masterCardId?: string;
  priceKey?: string;
  cardName?: string;
  name?: string;
  cardNumber?: string;
  rarity?: string | null;
  [key: string]: unknown;
};

type BrandListEntry = {
  id: string;
  name: string;
  logo?: { r2ObjectKey?: string };
};

type PricingData = {
  pricing: unknown;
  history: unknown;
  trends: unknown;
} | null;

type AdminClientProps = {
  mediaBaseUrl: string;
};

function ColHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="shrink-0 border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
      {label}
      {count !== undefined && (
        <span className="ml-1 font-normal text-neutral-400">({count})</span>
      )}
    </div>
  );
}

function ColItem({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 text-left text-sm ${
        selected
          ? "bg-blue-500 text-white"
          : "text-[var(--foreground)] hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

export function AdminClient({ mediaBaseUrl }: AdminClientProps) {
  const [selection, setSelection] = useState<AdminSelection>({
    brand: null,
    seriesName: null,
    setCode: null,
    cardId: null,
  });

  const [brands, setBrands] = useState<BrandListEntry[]>([]);
  const [setsByBrand, setSetsByBrand] = useState<Map<string, SetItem[]>>(new Map());
  const [cardsBySet, setCardsBySet] = useState<Map<string, CardItem[]>>(new Map());
  const [cardsLoading, setCardsLoading] = useState(false);
  const [pricingBySet, setPricingBySet] = useState<Map<string, PricingData>>(new Map());
  const [pricingLoading, setPricingLoading] = useState(false);

  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const [selectedItem, setSelectedItem] = useState<Record<string, unknown> | null>(null);
  const [selectedKind, setSelectedKind] = useState<SelectedItemKind | null>(null);
  const [cardPricing, setCardPricing] = useState<PricingData>(null);

  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadedSetsRef = useRef<Set<string>>(new Set());
  const loadedPricingRef = useRef<Set<string>>(new Set());

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData() {
    setLoadingData(true);
    setLoadError(null);
    try {
      const brandsRes = await fetch("/api/admin/data/brands");
      if (!brandsRes.ok) throw new Error(`Brands: ${brandsRes.status}`);
      const loadedBrands = await brandsRes.json() as BrandListEntry[];
      setBrands(loadedBrands);

      const setsResults = await Promise.all(
        loadedBrands.map(async (b) => {
          const url = adminSetsFetchPath(b.id);
          if (!url) return { id: b.id, sets: [] as SetItem[] };
          const res = await fetch(url);
          if (!res.ok) return { id: b.id, sets: [] as SetItem[] };
          return { id: b.id, sets: (await res.json()) as SetItem[] };
        }),
      );

      setSetsByBrand(new Map(setsResults.map((r) => [r.id, r.sets])));
      setDataLoaded(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingData(false);
    }
  }

  // Load cards when setCode changes
  useEffect(() => {
    if (!selection.brand || !selection.setCode) return;
    const key = `${selection.brand}:${selection.setCode}`;
    if (loadedSetsRef.current.has(key)) return;
    const url = adminCardsFetchPath(selection.brand, selection.setCode);
    if (!url) return;
    setCardsLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((cards) => {
        loadedSetsRef.current.add(key);
        setCardsBySet((prev) => new Map(prev).set(key, cards as CardItem[]));
      })
      .catch(console.error)
      .finally(() => setCardsLoading(false));
  }, [selection.brand, selection.setCode]);

  // Load pricing when setCode changes
  useEffect(() => {
    if (!selection.brand || !selection.setCode) return;
    const key = `${selection.brand}:${selection.setCode}`;
    if (loadedPricingRef.current.has(key)) return;
    const pricingUrl = adminPricingFetchPath(selection.brand, selection.setCode);
    if (!pricingUrl) return;
    setPricingLoading(true);
    fetch(pricingUrl)
      .then((r) => r.json())
      .then((data) => {
        loadedPricingRef.current.add(key);
        setPricingBySet((prev) => new Map(prev).set(key, data as PricingData));
      })
      .catch(console.error)
      .finally(() => setPricingLoading(false));
  }, [selection.brand, selection.setCode]);

  // Derive card pricing when card selection changes
  useEffect(() => {
    if (!selection.brand || !selection.setCode || !selection.cardId) {
      setCardPricing(null);
      return;
    }
    const key = `${selection.brand}:${selection.setCode}`;
    const setData = pricingBySet.get(key);
    if (!setData) { setCardPricing(null); return; }

    // For pokemon: keyed by externalId. For onepiece: keyed by priceKey.
    const cardId = selection.cardId;
    const pricing = setData.pricing as Record<string, unknown> | null;
    const history = setData.history as Record<string, unknown> | null;
    const trends = setData.trends as Record<string, unknown> | null;

    // Find the card to get its externalId (Pokemon) or priceKey (OP)
    const cards = cardsBySet.get(key) ?? [];
    const card = cards.find((c) => (c.masterCardId ?? c.priceKey) === cardId);
    // Pokemon: keyed by externalId. One Piece: keyed by priceKey if set, else setCode::cardNumber::variant
    const opFallbackKey = card
      ? [
          (card.setCode as string | undefined)?.trim().toUpperCase(),
          (card.cardNumber as string | undefined)?.trim().toUpperCase(),
          (card.variant as string | undefined) || "normal",
        ].join("::")
      : null;
    const lookupKey =
      (card?.externalId as string | undefined) ??
      (card?.priceKey as string | undefined) ??
      opFallbackKey ??
      cardId;

    setCardPricing({
      pricing: pricing?.[lookupKey] ?? pricing?.[cardId] ?? null,
      history: history?.[lookupKey] ?? history?.[cardId] ?? null,
      trends: trends?.[lookupKey] ?? trends?.[cardId] ?? null,
    });
  }, [selection.brand, selection.setCode, selection.cardId, pricingBySet, cardsBySet]);

  // ── Selection handlers ────────────────────────────────────────────────────

  function selectBrand(brand: Brand) {
    setSelection({ brand, seriesName: null, setCode: null, cardId: null });
    const entry = brands.find((b) => b.id === brand);
    setSelectedItem(
      entry
        ? { id: entry.id, name: entry.name, logo: entry.logo, brand: entry.id }
        : { brand },
    );
    setSelectedKind("brand");
    setDraft(null); setSaveError(null); setCardPricing(null);
  }

  function selectSeries(name: string) {
    setSelection((p) => ({ ...p, seriesName: name, setCode: null, cardId: null }));
    setSelectedItem({ seriesName: name });
    setSelectedKind("series");
    setDraft(null); setSaveError(null); setCardPricing(null);
  }

  function selectSet(setCode: string, item: Record<string, unknown>) {
    setSelection((p) => ({ ...p, setCode, cardId: null }));
    setSelectedItem(item);
    setSelectedKind("set");
    setDraft(null); setSaveError(null); setCardPricing(null);
  }

  function selectCard(cardId: string, item: Record<string, unknown>) {
    setSelection((p) => ({ ...p, cardId }));
    setSelectedItem(item);
    setSelectedKind("card");
    setDraft(null); setSaveError(null);
  }

  // ── Derived column data ───────────────────────────────────────────────────

  const brandSets = selection.brand ? (setsByBrand.get(selection.brand) ?? []) : [];
  const hasSeries = brandSets.some((s) => s.seriesName);

  const seriesNames: string[] = [];
  if (selection.brand && brandSets.length > 0) {
    if (hasSeries) {
      const seen = new Set<string>();
      for (const s of brandSets) {
        const sn = s.seriesName ?? "Other";
        if (!seen.has(sn)) { seen.add(sn); seriesNames.push(sn); }
      }
    } else {
      seriesNames.push("All Sets");
    }
  }

  const filteredSets: SetItem[] =
    selection.brand && selection.seriesName
      ? hasSeries
        ? brandSets.filter((s) => (s.seriesName ?? "Other") === selection.seriesName)
        : brandSets
      : [];

  const cacheKey = selection.brand && selection.setCode
    ? `${selection.brand}:${selection.setCode}` : null;
  const rawCards = cacheKey ? (cardsBySet.get(cacheKey) ?? []) : [];
  const cards = [...rawCards].sort((a, b) => {
    const na = parseFloat(a.cardNumber ?? "") ;
    const nb = parseFloat(b.cardNumber ?? "");
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return (a.cardNumber ?? "").localeCompare(b.cardNumber ?? "");
  });

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!draft || !selectedItem || !selectedKind || !selection.brand) return;
    if ((selectedKind === "set" || selectedKind === "card") && !adminBrandSupportsSetCardSave(selection.brand)) {
      setSaveError("Editing is not available for this brand yet.");
      return;
    }
    const updatedEntry = { ...selectedItem, ...draft };
    setSaving(true); setSaveError(null);
    try {
      let endpoint: string;
      let body: Record<string, unknown>;
      if (selectedKind === "set") {
        endpoint =
          selection.brand === "pokemon"
            ? "/api/admin/data/save-pokemon-set"
            : "/api/admin/data/save-onepiece-set";
        body = { updatedEntry };
      } else if (selectedKind === "card") {
        endpoint =
          selection.brand === "pokemon"
            ? "/api/admin/data/save-pokemon-card"
            : "/api/admin/data/save-onepiece-card";
        body = { setCode: selection.setCode, updatedEntry };
      } else {
        setSaving(false); return;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      if (selectedKind === "set" && selection.brand) {
        setSetsByBrand((prev) => {
          const next = new Map(prev);
          const existing = next.get(selection.brand!) ?? [];
          next.set(selection.brand!, existing.map((s) => s.id === updatedEntry.id ? updatedEntry as SetItem : s));
          return next;
        });
      } else if (selectedKind === "card" && cacheKey) {
        const idField = selection.brand === "pokemon" ? "masterCardId" : "priceKey";
        setCardsBySet((p) => {
          const next = new Map(p);
          next.set(cacheKey, (next.get(cacheKey) ?? []).map((c) =>
            c[idField] === updatedEntry[idField] ? updatedEntry as CardItem : c,
          ));
          return next;
        });
      }
      setSelectedItem(updatedEntry);
      setDraft(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Column shared style — full height, flex col, scrollable list
  const colClass = "flex flex-col border-r border-neutral-200 dark:border-neutral-700 overflow-hidden";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold">Admin</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Browse and edit data in R2. Saves go back to the same bucket.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loadError && <span className="text-xs text-red-500">{loadError}</span>}
          <button
            onClick={loadData}
            disabled={loadingData}
            className="flex items-center gap-2 rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loadingData && (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {dataLoaded ? "Reload from R2" : "Load from R2"}
          </button>
        </div>
      </div>

      {!dataLoaded ? (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
          {loadingData ? "Loading from R2…" : "Click Load from R2 to browse brands, sets, and cards"}
        </div>
      ) : (
        <>
          {/* Main content — flex row, fills all space between header and scraper panel */}
          <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

            {/* Brand column */}
            <div className={colClass} style={{ width: 140, flexShrink: 0 }}>
              <ColHeader label="Brand" />
              <div style={{ flex: 1, overflowY: "auto" }}>
                {brands.map(({ id, name }) => (
                  <ColItem key={id} selected={selection.brand === id} onClick={() => selectBrand(id)}>
                    {name}
                  </ColItem>
                ))}
              </div>
            </div>

            {/* Series column */}
            <div className={colClass} style={{ width: 170, flexShrink: 0 }}>
              <ColHeader label="Series" />
              <div style={{ flex: 1, overflowY: "auto" }}>
                {seriesNames.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-neutral-400">Select a brand</div>
                ) : seriesNames.map((name) => (
                  <ColItem key={name} selected={selection.seriesName === name} onClick={() => selectSeries(name)}>
                    {name}
                  </ColItem>
                ))}
              </div>
            </div>

            {/* Sets column */}
            <div className={colClass} style={{ width: 180, flexShrink: 0 }}>
              <ColHeader label="Sets" count={filteredSets.length || undefined} />
              <div style={{ flex: 1, overflowY: "auto" }}>
                {filteredSets.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-neutral-400">Select a series</div>
                ) : filteredSets.map((set) => {
                  const code = set.setCode ?? set.setKey ?? set.id;
                  return (
                    <ColItem key={set.id} selected={selection.setCode === code} onClick={() => selectSet(code, set as Record<string, unknown>)}>
                      <div className="text-xs font-medium">{code}</div>
                      <div className={`truncate text-xs ${selection.setCode === code ? "text-blue-100" : "text-neutral-500"}`}>
                        {set.name}
                      </div>
                    </ColItem>
                  );
                })}
              </div>
            </div>

            {/* Cards column */}
            <div className={colClass} style={{ width: 200, flexShrink: 0 }}>
              <ColHeader label="Cards" count={cards.length || undefined} />
              <div style={{ flex: 1, overflowY: "auto" }}>
                {cardsLoading ? (
                  <div className="px-3 py-2 text-xs text-neutral-400">Loading…</div>
                ) : cards.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-neutral-400">Select a set</div>
                ) : cards.map((card) => {
                  const id = card.masterCardId ?? card.priceKey ?? "";
                  const name = card.cardName ?? card.name ?? id;
                  const isSelected = selection.cardId === id;
                  return (
                    <ColItem key={id} selected={isSelected} onClick={() => selectCard(id, card as Record<string, unknown>)}>
                      <div className="flex items-center gap-1">
                        {card.cardNumber && (
                          <span className={`shrink-0 font-mono text-xs ${isSelected ? "text-blue-200" : "text-neutral-400"}`}>
                            {card.cardNumber}
                          </span>
                        )}
                        <span className="truncate text-xs">{name}</span>
                      </div>
                      {card.rarity && (
                        <div className={`truncate text-xs ${isSelected ? "text-blue-200" : "text-neutral-400"}`}>
                          {card.rarity}
                        </div>
                      )}
                    </ColItem>
                  );
                })}
              </div>
            </div>

            {/* Detail pane */}
            <DetailPane
              item={selectedItem}
              kind={selectedKind}
              draft={draft}
              saving={saving}
              saveError={saveError}
              cardPricing={cardPricing}
              pricingLoading={pricingLoading}
              mediaBaseUrl={mediaBaseUrl}
              onFieldChange={(f, v) => { setDraft((p) => ({ ...(p ?? {}), [f]: v })); setSaveError(null); }}
              onSave={handleSave}
              onCancelEdit={() => setDraft(null)}
            />
          </div>

          {/* Scraper panel */}
          <ScraperPanel />
        </>
      )}
    </div>
  );
}
