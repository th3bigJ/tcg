"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppDrawerMenu } from "@/components/AppDrawerMenu";
import { CardGrid, type CardEntry } from "@/components/CardGrid";
import { SealedTopChromeFilters } from "@/components/SealedTopChromeFilters";
import { DASHBOARD_MENU_TOGGLE_EVENT } from "@/lib/dashboardMenuEvents";
import {
  type SortOrder,
  DEFAULT_SORT,
  SEARCH_DEFAULT_SORT,
  persistFilters,
  readPersistedFilters,
  type PersistedFilterScope,
} from "@/lib/persistedFilters";
import type { SearchCardDataPayload } from "@/lib/searchCardDataServer";
import { pushRecentSearch, readRecentSearches } from "@/lib/recentSearches";
import { useAutoHideChrome } from "@/lib/useAutoHideChrome";

// ─── Types ─────────────────────────────────────────────────────────────────────

type CardResult = {
  masterCardId: string;
  cardName: string;
  setCode: string;
  setName: string;
  imageLowSrc: string;
  rarity: string;
};

type SetResult = {
  code: string;
  name: string;
  logoSrc: string;
  cardCountOfficial: number | null;
};

type PokemonResult = {
  nationalDexNumber: number;
  name: string;
  imageUrl: string;
};

type SealedResult = {
  id: number;
  name: string;
  imageUrl: string;
  series: string | null;
  type: string | null;
  marketValue: number | null;
  marketValueGbp?: number | null;
  releaseDate: string | null;
};

type SearchResults = {
  cards: CardResult[];
  sets: SetResult[];
  pokemon: PokemonResult[];
  sealed: SealedResult[];
  collection: CardResult[];
  wishlist: CardResult[];
};

type Filters = {
  rarity: string;
  energy: string;
  excludeCommonUncommon: boolean;
  excludeCollected: boolean;
  duplicatesOnly: boolean;
  category: string;
  missingOnly: boolean;
  groupBySet: boolean;
  showOwnedOnly: boolean;
  sort: SortOrder;
};

type FacetOptions = {
  rarityOptions: string[];
  energyOptions: string[];
  categoryOptions: string[];
};

type FilterSheetKey = "sort" | "energy" | "rarity" | "category";

function getDefaultSortForContext(params: {
  pathname: string;
  tab: string;
  selectedSet: string;
  selectedPokemon: string;
  selectedSearch: string;
  selectedRarity: string;
  selectedEnergy: string;
  selectedCategory: string;
  excludeCommonUncommon: boolean;
  excludeCollected: boolean;
  duplicatesOnly: boolean;
  missingOnly: boolean;
}): SortOrder {
  const isPlainSearchBrowse =
    params.pathname.startsWith("/search") &&
    params.tab === "cards" &&
    !params.selectedSet &&
    !params.selectedPokemon &&
    !params.selectedSearch &&
    !params.selectedRarity &&
    !params.selectedEnergy &&
    !params.selectedCategory &&
    !params.excludeCommonUncommon &&
    !params.excludeCollected &&
    !params.duplicatesOnly &&
    !params.missingOnly;

  return isPlainSearchBrowse ? SEARCH_DEFAULT_SORT : DEFAULT_SORT;
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

function IconSearch() {
  return (
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function IconSort() {
  return (
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
      <path d="M11 5h10" />
      <path d="M11 9h7" />
      <path d="M11 13h4" />
      <path d="M4 17V7" />
      <path d="m1 10 3-3 3 3" />
      <path d="M20 17v-6" />
      <path d="m17 14 3 3 3-3" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TopChromeIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full border border-white/12 bg-black text-white/78 shadow-[0_8px_32px_rgba(0,0,0,0.6)] transition hover:bg-white/[0.08] hover:text-white"
      aria-label={label}
    >
      {children}
    </button>
  );
}

function TopChromeChipButton({
  label,
  active = false,
  clearable = false,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  clearable?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[12px] font-medium transition ${
        active
          ? "border-2 border-white bg-black text-white"
          : "border-white/24 bg-black text-white/88 hover:border-white/40 hover:bg-white/[0.06]"
      }`}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
      {active && clearable ? <span className="text-[11px] text-white/70">×</span> : null}
    </button>
  );
}

function TopChromeChipLink({
  label,
  active = false,
  clearable = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  clearable?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium transition ${
        active
          ? "border-2 border-white bg-black text-white"
          : "border-white/24 bg-black text-white/88 hover:border-white/40 hover:bg-white/[0.06]"
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      {active && clearable ? <span className="ml-1 text-[11px] text-white/70">×</span> : null}
    </button>
  );
}

function TopChromeChipSelect({
  label,
  active = false,
  clearable = false,
  count,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  clearable?: boolean;
  count?: number;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  const hasLeadingIcon = Boolean(icon);
  const displayLabel = count && count > 0 ? `${label} (${count})` : label;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-8 shrink-0 items-center rounded-full border ${hasLeadingIcon ? "pl-8" : "pl-3"} pr-7 text-[12px] font-medium outline-none transition ${
        active
          ? "border-2 border-white bg-black text-white"
          : "border-white/24 bg-black text-white/88 hover:border-white/40 hover:bg-white/[0.06]"
      }`}
    >
      <span className="whitespace-nowrap opacity-0" aria-hidden="true">
        {displayLabel}
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-nowrap">
        <span className={hasLeadingIcon ? "pl-8 pr-7" : "pl-3 pr-7"}>
          {displayLabel}
        </span>
      </span>
      {icon ? (
        <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${active ? "text-white" : "text-white/78"}`}>
          {icon}
        </span>
      ) : null}
      {active && clearable ? (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-white/70">×</span>
      ) : (
        <span className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${active ? "text-white" : "text-white/60"}`}>
          <IconChevronDown />
        </span>
      )}
    </button>
  );
}

function TopChromeClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-red-400/45 bg-red-500/14 px-3 text-[12px] font-medium text-red-300 transition hover:bg-red-500/22"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
      Clear
    </button>
  );
}

function TagSlot({
  active,
  pinnedOrder,
  children,
}: {
  active: boolean;
  pinnedOrder?: number;
  children: React.ReactNode;
}) {
  const order = pinnedOrder ?? (active ? 2 : 3);
  return <div className="shrink-0" style={{ order }}>{children}</div>;
}

// ─── Filter select ──────────────────────────────────────────────────────────────

// ─── Card thumbnail ─────────────────────────────────────────────────────────────

function CardThumb({ card, onClick }: { card: CardResult; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1.5 text-left transition hover:bg-white/10"
    >
      <img
        src={card.imageLowSrc}
        alt={card.cardName}
        className="w-full rounded object-contain"
        loading="lazy"
      />
      <span className="line-clamp-1 w-full text-center text-[10px] text-white/80">{card.cardName}</span>
      {card.setName ? <span className="line-clamp-1 w-full text-center text-[9px] text-white/40">{card.setName}</span> : null}
    </button>
  );
}

function formatSealedResultMeta(item: SealedResult): string {
  const primary = (item.series ?? "").trim() || (item.type ?? "").trim();
  if (primary) return primary;
  if (!item.releaseDate) return "";
  const parsed = Date.parse(item.releaseDate);
  if (!Number.isFinite(parsed)) return "";
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "UTC" }).format(new Date(parsed));
}

function formatSealedResultPrice(value: number | null | undefined): string {
  if (typeof value !== "number") return "";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function SealedThumb({ item, onClick }: { item: SealedResult; onClick: () => void }) {
  const meta = formatSealedResultMeta(item);
  const price = formatSealedResultPrice(item.marketValueGbp);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1.5 text-left transition hover:bg-white/10"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded bg-white">
        <img
          src={item.imageUrl}
          alt={item.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
      <span className="line-clamp-1 w-full text-center text-[10px] text-white/80">{item.name}</span>
      {meta ? <span className="line-clamp-1 w-full text-center text-[9px] text-white/40">{meta}</span> : null}
      {price ? <span className="line-clamp-1 w-full text-center text-[9px] text-white/55">{price}</span> : null}
    </button>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  href,
  onNavigate,
}: {
  title: string;
  href: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center justify-between py-1 text-xs font-semibold text-white/65 hover:text-white/90"
    >
      <span>{title}</span>
      <span className="flex items-center gap-0.5 text-[10px] font-normal text-white/45">
        View all <IconChevronRight />
      </span>
    </Link>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

type SectionKey = "cards" | "sets" | "pokedex" | "sealed" | "collection" | "wishlist";

function getSectionPriority(pathname: string, searchTab: string): SectionKey {
  if (pathname.startsWith("/collect/shared")) return "collection";
  if (pathname.startsWith("/collect")) return "collection";
  if (pathname.startsWith("/wishlist")) return "wishlist";
  if ((pathname.startsWith("/search") && searchTab === "sealed") || pathname === "/sealed" || pathname.startsWith("/sealed/")) {
    return "sealed";
  }
  if (pathname.startsWith("/expansions")) return "sets";
  if (pathname.startsWith("/pokedex")) return "pokedex";
  return "cards";
}

type QuickViewState = {
  card: CardEntry;
  searchCardData: SearchCardDataPayload | null;
};

export function UniversalSearch({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const searchTab = searchParams?.get("tab") ?? "cards";
  const friendsTab = searchParams?.get("tab") ?? "collection";
  const selectedSetParam = searchParams?.get("set") ?? "";
  const selectedPokemonParam = searchParams?.get("pokemon") ?? "";
  const selectedSearchParam = searchParams?.get("search") ?? "";
  const selectedRarityParam = searchParams?.get("rarity") ?? "";
  const selectedEnergyParam = searchParams?.get("energy") ?? "";
  const selectedCategoryParam = searchParams?.get("category") ?? "";
  const excludeCommonUncommonParam = searchParams?.get("exclude_cu") === "1";
  const excludeCollectedParam = searchParams?.get("exclude_owned") === "1";
  const duplicatesOnlyParam = searchParams?.get("duplicates_only") === "1";
  const missingOnlyParam = searchParams?.get("missing_only") === "1";
  const defaultSortForPage = getDefaultSortForContext({
    pathname,
    tab: searchTab,
    selectedSet: selectedSetParam,
    selectedPokemon: selectedPokemonParam,
    selectedSearch: selectedSearchParam,
    selectedRarity: selectedRarityParam,
    selectedEnergy: selectedEnergyParam,
    selectedCategory: selectedCategoryParam,
    excludeCommonUncommon: excludeCommonUncommonParam,
    excludeCollected: excludeCollectedParam,
    duplicatesOnly: duplicatesOnlyParam,
    missingOnly: missingOnlyParam,
  });
  const isFriendsCardsPage = /^\/collect\/shared\/[^/]+$/.test(pathname) && (friendsTab === "collection" || friendsTab === "wishlist");
  const filterScope: PersistedFilterScope | undefined =
    isFriendsCardsPage
      ? friendsTab === "wishlist"
        ? "friends-wishlist"
        : "friends-collection"
    : pathname.startsWith("/collect/shared")
      ? "friends"
      : /^\/expansions\/[^/]+/.test(pathname)
        ? "expansions"
        : /^\/pokedex\/[^/]+/.test(pathname)
          ? "pokedex"
          : pathname.startsWith("/search")
            ? searchTab === "pokedex"
              ? "pokedex"
              : searchTab === "sets"
                ? "expansions"
                : "search"
      : pathname === "/collect"
        ? "collect"
      : pathname === "/wishlist"
          ? "wishlist"
          : undefined;
  const isFilterablePage =
    /^\/expansions\/[^/]+/.test(pathname) ||
    /^\/pokedex\/[^/]+/.test(pathname) ||
    pathname.startsWith("/search") ||
    pathname === "/collect" ||
    pathname === "/wishlist" ||
    isFriendsCardsPage;
  const inputRef = useRef<HTMLInputElement>(null);
  const modalTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const modalSwipeEligibleRef = useRef(false);
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [modalMode, setModalMode] = useState<"closed" | "search">("closed");
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterSheet, setFilterSheet] = useState<FilterSheetKey | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickView, setQuickView] = useState<QuickViewState | null>(null);
  const [quickViewLoading, setQuickViewLoading] = useState(false);
  const [facets, setFacets] = useState<FacetOptions>({
    rarityOptions: [],
    energyOptions: [],
    categoryOptions: [],
  });
  const [filters, setFilters] = useState<Filters>({
    rarity: "",
    energy: "",
    excludeCommonUncommon: false,
    excludeCollected: false,
    duplicatesOnly: false,
    category: "",
    missingOnly: false,
    groupBySet: false,
    showOwnedOnly: false,
    sort: defaultSortForPage,
  });

  const setFiltersAndPersist = useCallback((next: Filters) => {
    setFilters(next);
    persistFilters(next, filterScope);
  }, [filterScope]);

  const filtersRef = useRef(filters);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const syncPersistedFilters = () => {
      const persisted = readPersistedFilters(filterScope);
      const nextFilters: Filters = {
        rarity: persisted.rarity ?? "",
        energy: persisted.energy ?? "",
        excludeCommonUncommon: persisted.excludeCommonUncommon ?? false,
        excludeCollected: persisted.excludeCollected ?? false,
        duplicatesOnly: persisted.duplicatesOnly ?? false,
        category: persisted.category ?? "",
        missingOnly: persisted.missingOnly ?? false,
        groupBySet: persisted.groupBySet ?? false,
        showOwnedOnly: persisted.showOwnedOnly ?? false,
        sort: persisted.sort ?? defaultSortForPage,
      };

      if (/^\/expansions\/[^/]+/.test(pathname) || /^\/pokedex\/[^/]+/.test(pathname)) {
        nextFilters.rarity = searchParams?.get("rarity") ?? "";
        nextFilters.energy = searchParams?.get("energy") ?? "";
        nextFilters.category = searchParams?.get("category") ?? "";
        nextFilters.excludeCommonUncommon = searchParams?.get("exclude_cu") === "1";
        nextFilters.excludeCollected = searchParams?.get("exclude_owned") === "1";
        nextFilters.duplicatesOnly = searchParams?.get("duplicates_only") === "1";
        nextFilters.groupBySet = searchParams?.get("group_by_set") === "1";
      } else if (pathname.startsWith("/search")) {
        const tab = searchParams?.get("tab") ?? "cards";
        if (tab === "cards") {
          nextFilters.rarity = searchParams?.get("rarity") ?? "";
          nextFilters.energy = searchParams?.get("energy") ?? "";
          nextFilters.category = searchParams?.get("category") ?? "";
          nextFilters.excludeCommonUncommon = searchParams?.get("exclude_cu") === "1";
          nextFilters.excludeCollected = searchParams?.get("exclude_owned") === "1";
          nextFilters.duplicatesOnly = searchParams?.get("duplicates_only") === "1";
          nextFilters.showOwnedOnly = searchParams?.get("owned_only") === "1";
          nextFilters.sort = (searchParams?.get("sort") as SortOrder | null) ?? defaultSortForPage;
          nextFilters.missingOnly = false;
        } else if (tab === "pokedex") {
          nextFilters.missingOnly = searchParams?.get("missing_only") === "1";
          nextFilters.rarity = "";
          nextFilters.energy = "";
          nextFilters.category = "";
          nextFilters.excludeCommonUncommon = false;
          nextFilters.excludeCollected = false;
          nextFilters.duplicatesOnly = false;
          nextFilters.showOwnedOnly = false;
        }
      } else if (pathname === "/collect" || pathname === "/wishlist" || isFriendsCardsPage) {
        if (searchParams?.has("group_by_set")) {
          nextFilters.groupBySet = searchParams.get("group_by_set") === "1";
        }
      }

      setFilters(nextFilters);
    };

    syncPersistedFilters();
    window.addEventListener("storage", syncPersistedFilters);
    return () => {
      window.removeEventListener("storage", syncPersistedFilters);
    };
  }, [defaultSortForPage, filterScope, pathname, searchParams, isFriendsCardsPage]);

  useEffect(() => {
    if (!filterScope) return;

    const persisted = readPersistedFilters(filterScope);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const activeSearchTab = params.get("tab") ?? "cards";
    let changed = false;

    if (pathname === "/collect" || pathname === "/wishlist" || isFriendsCardsPage) {
      if (!params.has("group_by_set") && persisted.groupBySet) {
        params.delete("take");
        params.delete("set_take");
        params.set("group_by_set", "1");
        changed = true;
      }
    } else if (/^\/expansions\/[^/]+/.test(pathname)) {
      if (!params.has("rarity") && persisted.rarity) {
        params.set("rarity", persisted.rarity);
        changed = true;
      }
      if (!params.has("energy") && persisted.energy) {
        params.set("energy", persisted.energy);
        changed = true;
      }
      if (!params.has("category") && persisted.category) {
        params.set("category", persisted.category);
        changed = true;
      }
      if (!params.has("exclude_cu") && persisted.excludeCommonUncommon) {
        params.set("exclude_cu", "1");
        changed = true;
      }
      if (!params.has("exclude_owned") && persisted.excludeCollected) {
        params.set("exclude_owned", "1");
        changed = true;
      }
      if (!params.has("duplicates_only") && persisted.duplicatesOnly) {
        params.set("duplicates_only", "1");
        changed = true;
      }
    } else if (/^\/pokedex\/[^/]+/.test(pathname)) {
      if (!params.has("rarity") && persisted.rarity) {
        params.set("rarity", persisted.rarity);
        changed = true;
      }
      if (!params.has("energy") && persisted.energy) {
        params.set("energy", persisted.energy);
        changed = true;
      }
      if (!params.has("category") && persisted.category) {
        params.set("category", persisted.category);
        changed = true;
      }
      if (!params.has("exclude_cu") && persisted.excludeCommonUncommon) {
        params.set("exclude_cu", "1");
        changed = true;
      }
      if (!params.has("exclude_owned") && persisted.excludeCollected) {
        params.set("exclude_owned", "1");
        changed = true;
      }
      if (!params.has("duplicates_only") && persisted.duplicatesOnly) {
        params.set("duplicates_only", "1");
        changed = true;
      }
      if (!params.has("group_by_set") && persisted.groupBySet) {
        params.set("group_by_set", "1");
        changed = true;
      }
    } else if (pathname.startsWith("/search")) {
      if (!params.has("tab")) {
        params.set("tab", activeSearchTab);
        changed = true;
      }
      if (activeSearchTab === "cards") {
        if (!params.has("rarity") && persisted.rarity) {
          params.set("rarity", persisted.rarity);
          changed = true;
        }
        if (!params.has("energy") && persisted.energy) {
          params.set("energy", persisted.energy);
          changed = true;
        }
        if (!params.has("category") && persisted.category) {
          params.set("category", persisted.category);
          changed = true;
        }
        if (!params.has("exclude_cu") && persisted.excludeCommonUncommon) {
          params.set("exclude_cu", "1");
          changed = true;
        }
        if (!params.has("exclude_owned") && persisted.excludeCollected) {
          params.set("exclude_owned", "1");
          changed = true;
        }
        if (!params.has("duplicates_only") && persisted.duplicatesOnly) {
          params.set("duplicates_only", "1");
          changed = true;
        }
        if (!params.has("owned_only") && persisted.showOwnedOnly) {
          params.set("owned_only", "1");
          changed = true;
        }
        if (!params.has("sort") && persisted.sort) {
          params.set("sort", persisted.sort);
          changed = true;
        }
      } else if (activeSearchTab === "pokedex") {
        if (!params.has("missing_only") && persisted.missingOnly) {
          params.set("missing_only", "1");
          changed = true;
        }
      }
    }

    if (!changed) return;

    const nextSearch = params.toString();
    const href = nextSearch ? `${pathname}?${nextSearch}` : pathname;
    router.replace(href, { scroll: false });
  }, [filterScope, pathname, router, searchParams, isFriendsCardsPage]);

  const injectFilters = useCallback((rawHref: string): string | null => {
      let url: URL;
      try { url = new URL(rawHref, window.location.origin); } catch { return null; }
      if (url.origin !== window.location.origin) return null;
      const path = url.pathname;
      const f = filtersRef.current;
      const hasFilters =
        f.rarity || f.energy || f.excludeCommonUncommon || f.excludeCollected || f.duplicatesOnly || f.category;

      if (/^\/expansions\/[^/]+/.test(path)) {
        if (f.rarity) url.searchParams.set("rarity", f.rarity); else url.searchParams.delete("rarity");
        if (f.energy) url.searchParams.set("energy", f.energy); else url.searchParams.delete("energy");
        if (f.excludeCommonUncommon) url.searchParams.set("exclude_cu", "1"); else url.searchParams.delete("exclude_cu");
        if (f.excludeCollected) url.searchParams.set("exclude_owned", "1"); else url.searchParams.delete("exclude_owned");
        if (f.duplicatesOnly) url.searchParams.set("duplicates_only", "1"); else url.searchParams.delete("duplicates_only");
        if (f.category) url.searchParams.set("category", f.category); else url.searchParams.delete("category");
        return url.pathname + (url.search || "");
      }

      if (/^\/pokedex\/[^/]+/.test(path)) {
        if (f.energy) url.searchParams.set("energy", f.energy); else url.searchParams.delete("energy");
        if (f.rarity) url.searchParams.set("rarity", f.rarity); else url.searchParams.delete("rarity");
        if (f.excludeCommonUncommon) url.searchParams.set("exclude_cu", "1"); else url.searchParams.delete("exclude_cu");
        if (f.excludeCollected) url.searchParams.set("exclude_owned", "1"); else url.searchParams.delete("exclude_owned");
        if (f.duplicatesOnly) url.searchParams.set("duplicates_only", "1"); else url.searchParams.delete("duplicates_only");
        if (f.category) url.searchParams.set("category", f.category); else url.searchParams.delete("category");
        return url.pathname + (url.search || "");
      }

      if (path === "/search" || path.startsWith("/search?")) {
        const tab = url.searchParams.get("tab") ?? "cards";
        if (tab === "cards" && hasFilters) {
          if (f.rarity) url.searchParams.set("rarity", f.rarity); else url.searchParams.delete("rarity");
          if (f.energy) url.searchParams.set("energy", f.energy); else url.searchParams.delete("energy");
          if (f.excludeCommonUncommon) url.searchParams.set("exclude_cu", "1"); else url.searchParams.delete("exclude_cu");
          if (f.excludeCollected) url.searchParams.set("exclude_owned", "1"); else url.searchParams.delete("exclude_owned");
          if (f.duplicatesOnly) url.searchParams.set("duplicates_only", "1"); else url.searchParams.delete("duplicates_only");
          if (f.category) url.searchParams.set("category", f.category); else url.searchParams.delete("category");
          return url.pathname + (url.search || "");
        }
        if (tab === "pokedex" && f.missingOnly) {
          url.searchParams.set("missing_only", "1");
          return url.pathname + (url.search || "");
        }
      }

      return null;
    }, []);

  const handleScopedLinkClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor || !anchor.href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

    const rewritten = injectFilters(anchor.href);
    if (!rewritten) return;

    const current = anchor.pathname + anchor.search;
    if (rewritten === current) return;

    event.preventDefault();
    router.push(rewritten);
  }, [injectFilters, router]);

  // Load facets once on mount
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/universal-search?facets=1", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as FacetOptions;
        setFacets(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // silently ignore
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, []);

  // Run search with debounce
  const runSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.trim().length < 2) {
        searchAbortRef.current?.abort();
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(() => {
        searchAbortRef.current?.abort();
        const controller = new AbortController();
        searchAbortRef.current = controller;
        const requestId = searchRequestIdRef.current + 1;
        searchRequestIdRef.current = requestId;
        void (async () => {
          try {
            const res = await fetch(`/api/universal-search?q=${encodeURIComponent(q)}`, {
              credentials: "include",
              signal: controller.signal,
            });
            if (!res.ok) return;
            const data = (await res.json()) as SearchResults;
            if (requestId !== searchRequestIdRef.current) return;
            startTransition(() => {
              setResults(data);
            });
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            // silently ignore
          } finally {
            if (requestId === searchRequestIdRef.current) {
              setLoading(false);
            }
          }
        })();
      }, 300);
    },
    [],
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (modalMode !== "search") setModalMode("search");
    runSearch(value);
  };

  const handleRecentPick = (value: string) => {
    handleQueryChange(value);
  };

  const openSearch = () => {
    setModalMode("search");
  };

  const close = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchAbortRef.current?.abort();
    const q = query;
    setModalMode("closed");
    setLoading(false);
    setQuery("");
    setResults(null);
    if (q.trim().length >= 2) {
      pushRecentSearch(q.trim());
      setRecentSearches(readRecentSearches());
    }
  }, [query]);

  const handleNavigate = () => {
    close();
  };

  // Build href for the current page with filters applied
  function buildCurrentPageHref(nextFilters: Filters = filters, nextQuery: string = query) {
    const expansionMatch = pathname.match(/^\/expansions\/([^/]+)/);
    const pokedexDetailMatch = pathname.match(/^\/pokedex\/([^/]+)/);

    if (expansionMatch) {
      const p = new URLSearchParams();
      if (nextQuery) p.set("search", nextQuery);
      if (nextFilters.rarity) p.set("rarity", nextFilters.rarity);
      if (nextFilters.energy) p.set("energy", nextFilters.energy);
      if (nextFilters.excludeCommonUncommon) p.set("exclude_cu", "1");
      if (nextFilters.excludeCollected) p.set("exclude_owned", "1");
      if (nextFilters.duplicatesOnly) p.set("duplicates_only", "1");
      if (nextFilters.category) p.set("category", nextFilters.category);
      const s = p.toString();
      return s ? `/expansions/${expansionMatch[1]}?${s}` : `/expansions/${expansionMatch[1]}`;
    }

    if (pokedexDetailMatch) {
      const p = new URLSearchParams();
      if (nextFilters.energy) p.set("energy", nextFilters.energy);
      if (nextFilters.rarity) p.set("rarity", nextFilters.rarity);
      if (nextFilters.excludeCommonUncommon) p.set("exclude_cu", "1");
      if (nextFilters.excludeCollected) p.set("exclude_owned", "1");
      if (nextFilters.duplicatesOnly) p.set("duplicates_only", "1");
      if (nextFilters.category) p.set("category", nextFilters.category);
      if (nextFilters.groupBySet) p.set("group_by_set", "1");
      const s = p.toString();
      return s ? `/pokedex/${pokedexDetailMatch[1]}?${s}` : `/pokedex/${pokedexDetailMatch[1]}`;
    }

    if (pathname.startsWith("/search")) {
      const p = new URLSearchParams();
      // Preserve tab and seed from current URL if present
      const currentParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const tab = currentParams.get("tab") ?? "cards";
      const seed = currentParams.get("seed");
      p.set("tab", tab);
      if (seed && nextFilters.sort === "random") p.set("seed", seed);
      if (nextFilters.sort) p.set("sort", nextFilters.sort);
      if (selectedSetParam) p.set("set", selectedSetParam);
      if (selectedPokemonParam) p.set("pokemon", selectedPokemonParam);
        if (tab === "cards") {
          if (nextQuery) p.set("search", nextQuery);
          if (nextFilters.rarity) p.set("rarity", nextFilters.rarity);
          if (nextFilters.energy) p.set("energy", nextFilters.energy);
          if (nextFilters.excludeCommonUncommon) p.set("exclude_cu", "1");
          if (nextFilters.excludeCollected) p.set("exclude_owned", "1");
          if (nextFilters.duplicatesOnly) p.set("duplicates_only", "1");
          if (nextFilters.showOwnedOnly) p.set("owned_only", "1");
          if (nextFilters.category) p.set("category", nextFilters.category);
        } else if (tab === "pokedex") {
        if (nextFilters.missingOnly) p.set("missing_only", "1");
      }
      return `/search?${p.toString()}`;
    }

    if (pathname === "/collect" || pathname === "/wishlist" || isFriendsCardsPage) {
      const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      p.delete("take");
      p.delete("set_take");
      if (nextFilters.groupBySet) p.set("group_by_set", "1");
      else p.delete("group_by_set");
      const s = p.toString();
      return s ? `${pathname}?${s}` : pathname;
    }

    return null;
  }

  const applyTopChromeFilters = (nextFilters: Filters) => {
    setFiltersAndPersist(nextFilters);
    if (!isFilterablePage) return;
    const href = buildCurrentPageHref(nextFilters);
    if (!href) return;
    if (pathname === "/collect" || pathname === "/wishlist" || isFriendsCardsPage) {
      router.replace(href, { scroll: false });
      return;
    }
    router.replace(href);
  };

  const clearTopChromeFilters = () => {
    const resetFilters: Filters = {
      ...filters,
      rarity: "",
      energy: "",
      excludeCommonUncommon: false,
      excludeCollected: false,
      duplicatesOnly: false,
      category: "",
      missingOnly: false,
      groupBySet: false,
      showOwnedOnly: false,
    };
    setFiltersAndPersist(resetFilters);

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("set");
    params.delete("pokemon");
    params.delete("rarity");
    params.delete("energy");
    params.delete("exclude_cu");
    params.delete("exclude_owned");
    params.delete("duplicates_only");
    params.delete("owned_only");
    params.delete("sort");
    params.delete("category");
    params.delete("missing_only");
    params.delete("group_by_set");
    params.delete("take");

    const qs = params.toString();
    const targetPath =
      pathname === "/expansions" || pathname.startsWith("/expansions/")
        ? "/expansions"
        : pathname === "/pokedex" || pathname.startsWith("/pokedex/")
          ? "/pokedex"
          : pathname === "/collect" || pathname === "/wishlist" || isFriendsCardsPage
            ? pathname
            : "/search";
    const href = qs ? `${targetPath}?${qs}` : targetPath;

    if (pathname === "/collect" || pathname === "/wishlist" || isFriendsCardsPage) {
      router.replace(href, { scroll: false });
      return;
    }
    router.replace(href);
  };

  // Build href for "view all" links, carrying query + filters
  function buildCardsHref() {
    const p = new URLSearchParams();
    if (query) p.set("search", query);
    if (filters.rarity) p.set("rarity", filters.rarity);
    if (filters.energy) p.set("energy", filters.energy);
    if (filters.excludeCommonUncommon) p.set("exclude_cu", "1");
    if (filters.excludeCollected) p.set("exclude_owned", "1");
    if (filters.duplicatesOnly) p.set("duplicates_only", "1");
    if (filters.category) p.set("category", filters.category);
    const s = p.toString();
    return s ? `/search?${s}` : "/search";
  }

  function buildSetsHref() {
    const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    p.delete("set");
    p.delete("take");
    const s = p.toString();
    return s ? `/expansions?${s}` : "/expansions";
  }

  function buildPokedexHref() {
    const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    p.delete("pokemon");
    p.delete("take");
    const s = p.toString();
    return s ? `/pokedex?${s}` : "/pokedex";
  }

  function buildSealedHref() {
    const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    p.set("tab", "sealed");
    if (query) p.set("search", query);
    else p.delete("search");
    p.delete("set");
    p.delete("pokemon");
    p.delete("rarity");
    p.delete("energy");
    p.delete("category");
    p.delete("artist");
    p.delete("exclude_cu");
    p.delete("exclude_owned");
    p.delete("owned_only");
    p.delete("duplicates_only");
    p.delete("missing_only");
    p.delete("open_card");
    p.delete("seed");
    p.delete("page");
    p.delete("take");
    const s = p.toString();
    return s ? `/search?${s}` : "/search?tab=sealed";
  }

  const hasResults =
    results &&
    (results.cards.length > 0 ||
      results.sets.length > 0 ||
      results.pokemon.length > 0 ||
      results.sealed.length > 0 ||
      results.collection.length > 0 ||
      results.wishlist.length > 0);

  const isOpen = modalMode !== "closed";
  const chromeVisible = useAutoHideChrome({ disabled: isOpen || menuOpen || filterSheet !== null });
  const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
    { value: "random", label: "Random" },
    { value: "price-desc", label: "Price" },
    { value: "price-asc", label: "Lowest price" },
    { value: "change-desc", label: "% change high-low" },
    { value: "change-asc", label: "% change low-high" },
    { value: "release-desc", label: "Newest" },
    { value: "release-asc", label: "Oldest" },
    { value: "number-desc", label: "Number desc" },
    { value: "number-asc", label: "Number asc" },
  ];
  const isSealedSearchTab = pathname.startsWith("/search") && searchTab === "sealed";
  const showBrowseTabRow =
    pathname.startsWith("/search") ||
    pathname.startsWith("/expansions") ||
    pathname.startsWith("/pokedex") ||
    pathname === "/sealed" ||
    pathname.startsWith("/sealed/");
  const showFilterRow = isFilterablePage && !isSealedSearchTab;
  const showSealedFilterRow = isSealedSearchTab;
  const contentTopOffset = showFilterRow && showBrowseTabRow
    ? "calc(max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) + 9rem)"
    : showSealedFilterRow && showBrowseTabRow
      ? "calc(max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) + 9rem)"
    : showFilterRow || showBrowseTabRow
      ? "calc(max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) + 6.5rem)"
      : "calc(max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) + 3.5rem)";
  const topChromePadding = showFilterRow && showBrowseTabRow
    ? "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) 1rem 1rem"
    : showSealedFilterRow && showBrowseTabRow
      ? "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) 1rem 1rem"
    : showFilterRow || showBrowseTabRow
      ? "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) 1rem 0.75rem"
      : "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) 1rem 0.5rem";
  const sheetConfig: Record<FilterSheetKey, { title: string; value: string; options: { value: string; label: string }[]; onApply: (value: string) => void }> = {
    sort: {
      title: "Sort",
      value: filters.sort,
      options: SORT_OPTIONS,
      onApply: (value) => applyTopChromeFilters({ ...filters, sort: value as SortOrder }),
    },
    energy: {
      title: "Energy",
      value: filters.energy,
      options: [{ value: "", label: "Any energy" }, ...facets.energyOptions.map((value) => ({ value, label: value }))],
      onApply: (value) => applyTopChromeFilters({ ...filters, energy: value }),
    },
    rarity: {
      title: "Rarity",
      value: filters.rarity,
      options: [{ value: "", label: "Any rarity" }, ...facets.rarityOptions.map((value) => ({ value, label: value }))],
      onApply: (value) => applyTopChromeFilters({ ...filters, rarity: value }),
    },
    category: {
      title: "Card type",
      value: filters.category,
      options: [{ value: "", label: "Any card type" }, ...facets.categoryOptions.map((value) => ({ value, label: value }))],
      onApply: (value) => applyTopChromeFilters({ ...filters, category: value }),
    },
  };
  const selectorBaseParams = new URLSearchParams(searchParams?.toString() ?? "");
  selectorBaseParams.delete("take");
  selectorBaseParams.delete("return_to");
  const setSelectorParams = new URLSearchParams(selectorBaseParams.toString());
  setSelectorParams.delete("set");
  setSelectorParams.delete("pokemon");
  const pokedexSelectorParams = new URLSearchParams(selectorBaseParams.toString());
  pokedexSelectorParams.delete("pokemon");
  pokedexSelectorParams.delete("set");
  const currentSearch = searchParams?.toString() ?? "";
  const currentReturnTo = `${pathname}${currentSearch ? `?${currentSearch}` : ""}`;
  setSelectorParams.set("return_to", currentReturnTo);
  pokedexSelectorParams.set("return_to", currentReturnTo);
  const setsHref = `/expansions${setSelectorParams.toString() ? `?${setSelectorParams.toString()}` : ""}`;
  const pokedexHref = `/pokedex${pokedexSelectorParams.toString() ? `?${pokedexSelectorParams.toString()}` : ""}`;
  const hasActiveTagFilters =
    Boolean(filters.rarity) ||
    Boolean(filters.energy) ||
    Boolean(filters.category) ||
    filters.excludeCommonUncommon ||
    filters.excludeCollected ||
    filters.duplicatesOnly ||
    filters.missingOnly ||
    filters.groupBySet ||
    filters.showOwnedOnly ||
    Boolean(selectedSetParam) ||
    Boolean(selectedPokemonParam);
  const prioritizeActiveFilterTags = hasMounted;
  const activeEnergyTag = prioritizeActiveFilterTags && Boolean(filters.energy);
  const activeRarityTag = prioritizeActiveFilterTags && Boolean(filters.rarity);
  const activeCategoryTag = prioritizeActiveFilterTags && Boolean(filters.category);
  const activeRarePlusTag = prioritizeActiveFilterTags && filters.excludeCommonUncommon;
  const activeGroupBySetTag = prioritizeActiveFilterTags && filters.groupBySet;
  const activeHideOwnedTag = prioritizeActiveFilterTags && filters.excludeCollected;
  const activeDuplicatesTag = prioritizeActiveFilterTags && filters.duplicatesOnly;
  const activeOwnedOnlyTag = prioritizeActiveFilterTags && filters.showOwnedOnly;
  const browseCardsHref = buildCardsHref();
  const browseSealedHref = buildSealedHref();
  const cardsTabActive = pathname.startsWith("/search") && searchTab !== "sealed";
  const setsTabActive = pathname === "/expansions" || pathname.startsWith("/expansions/");
  const pokedexTabActive = pathname === "/pokedex" || pathname.startsWith("/pokedex/");
  const sealedTabActive = isSealedSearchTab || pathname === "/sealed" || pathname.startsWith("/sealed/");

  const handleModalTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    modalTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    modalSwipeEligibleRef.current = touch.clientY >= window.innerHeight * 0.9;
  }, []);

  const resetModalSwipe = useCallback(() => {
    modalTouchStartRef.current = null;
    modalSwipeEligibleRef.current = false;
  }, []);

  const handleModalTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!modalSwipeEligibleRef.current || !modalTouchStartRef.current) {
      resetModalSwipe();
      return;
    }

    const touch = e.changedTouches[0];
    const deltaY = modalTouchStartRef.current.y - touch.clientY;
    const deltaX = Math.abs(modalTouchStartRef.current.x - touch.clientX);

    if (deltaY > 40 && deltaY > deltaX) close();
    resetModalSwipe();
  }, [close, resetModalSwipe]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen || menuOpen || filterSheet !== null) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen, menuOpen, filterSheet]);

  useEffect(() => {
    document.body.classList.toggle("app-menu-open", menuOpen);
    return () => document.body.classList.remove("app-menu-open");
  }, [menuOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setRecentSearches(readRecentSearches());
  }, [isOpen]);

  if (pathname.startsWith("/sealed/")) {
    return null;
  }

  return (
    <>
      <style>{`:root{--top-search-offset:${contentTopOffset};}`}</style>
      {/* Search chrome */}
      <div
        className="app-menu-push-fixed pointer-events-none fixed inset-x-0 top-0 z-[1002] isolate bg-black transition-transform duration-200 ease-out"
        style={{
          padding: topChromePadding,
          transform: chromeVisible ? "translate3d(0, 0, 0)" : "translate3d(0, -120%, 0)",
        }}
        onClickCapture={handleScopedLinkClickCapture}
      >
        <div className="mx-auto flex max-w-[34rem] flex-col gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <TopChromeIconButton
              label="Open menu"
              onClick={() => {
                if (pathname === "/dashboard") {
                  window.dispatchEvent(new CustomEvent(DASHBOARD_MENU_TOGGLE_EVENT));
                  return;
                }
                setMenuOpen(true);
              }}
            >
              <IconMenu />
            </TopChromeIconButton>

            <div
              className="flex min-w-0 flex-1 items-center gap-2"
              style={{
                height: "3.25rem",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "#000",
                padding: "0 0.625rem",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
                <span className="text-white/45">
                  <IconSearch />
                </span>
                {isOpen ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onFocus={() => { if (modalMode !== "search") setModalMode("search"); }}
                    placeholder="Search cards, sets, Pokemon, sealed..."
                    className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/35 outline-none"
                    autoFocus={modalMode === "search"}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={openSearch}
                    className="min-w-0 flex-1 truncate text-left text-sm text-white/45"
                    aria-label="Open search"
                  >
                    {query || "Search cards, sets, Pokemon, sealed..."}
                  </button>
                )}
                {isOpen && query ? (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}
                    onClickCapture={() => {
                      if (debounceRef.current) clearTimeout(debounceRef.current);
                      searchAbortRef.current?.abort();
                      setLoading(false);
                    }}
                    className="text-white/45 hover:text-white"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                ) : null}
              </div>

              <Link
                href="/scan"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
                aria-label="Scan card"
              >
                <IconCamera />
              </Link>

            </div>
          </div>

          {showBrowseTabRow ? (
            <div
              className="pointer-events-auto scrollbar-hide flex items-center gap-2 overflow-x-auto pb-0.5"
              style={{ paddingRight: "0.75rem" }}
            >
              <TopChromeChipLink
                label="Cards"
                active={cardsTabActive}
                onClick={() => {
                  router.push(browseCardsHref);
                }}
              />
              <TopChromeChipLink
                label="Sets"
                active={setsTabActive}
                onClick={() => {
                  router.push(setsHref);
                }}
              />
              <TopChromeChipLink
                label="Pokedex"
                active={pokedexTabActive}
                onClick={() => {
                  router.push(pokedexHref);
                }}
              />
              <TopChromeChipLink
                label="Sealed"
                active={sealedTabActive}
                onClick={() => {
                  router.push(browseSealedHref);
                }}
              />
            </div>
          ) : null}

          {showFilterRow ? (
            <div
              className="pointer-events-auto scrollbar-hide flex items-center gap-2 overflow-x-auto pb-0.5"
              style={{ paddingRight: "0.75rem" }}
            >
              {hasMounted && hasActiveTagFilters ? (
                <TagSlot active={false} pinnedOrder={0}>
                  <TopChromeClearButton onClick={clearTopChromeFilters} />
                </TagSlot>
              ) : null}

              <TagSlot active={false} pinnedOrder={1}>
                <TopChromeChipSelect
                  label="Sort"
                  active
                  onClick={() => setFilterSheet("sort")}
                  icon={<IconSort />}
                />
              </TagSlot>

              {isFilterablePage ? (
                <TagSlot active={activeEnergyTag}>
                  <TopChromeChipSelect
                    label="Energy"
                    active={activeEnergyTag}
                    clearable
                    count={activeEnergyTag ? 1 : undefined}
                    onClick={() => {
                      if (filters.energy) {
                        applyTopChromeFilters({ ...filters, energy: "" });
                        return;
                      }
                      setFilterSheet("energy");
                    }}
                  />
                </TagSlot>
              ) : null}

              {isFilterablePage ? (
                <TagSlot active={activeRarityTag}>
                  <TopChromeChipSelect
                    label="Rarity"
                    active={activeRarityTag}
                    clearable
                    count={activeRarityTag ? 1 : undefined}
                    onClick={() => {
                      if (filters.rarity) {
                        applyTopChromeFilters({ ...filters, rarity: "" });
                        return;
                      }
                      setFilterSheet("rarity");
                    }}
                  />
                </TagSlot>
              ) : null}

              {isFilterablePage ? (
                <TagSlot active={activeCategoryTag}>
                  <TopChromeChipSelect
                    label="Card type"
                    active={activeCategoryTag}
                    clearable
                    count={activeCategoryTag ? 1 : undefined}
                    onClick={() => {
                      if (filters.category) {
                        applyTopChromeFilters({ ...filters, category: "" });
                        return;
                      }
                      setFilterSheet("category");
                    }}
                  />
                </TagSlot>
              ) : null}

              {isFilterablePage ? (
                <TagSlot active={activeRarePlusTag}>
                  <TopChromeChipButton
                    label="Rare+ only"
                    active={activeRarePlusTag}
                    clearable
                    onClick={() => applyTopChromeFilters({ ...filters, excludeCommonUncommon: !filters.excludeCommonUncommon })}
                  />
                </TagSlot>
              ) : null}

              {isFilterablePage ? (
                <TagSlot active={activeGroupBySetTag}>
                  <TopChromeChipButton
                    label="Group by set"
                    active={activeGroupBySetTag}
                    clearable
                    onClick={() => applyTopChromeFilters({ ...filters, groupBySet: !filters.groupBySet })}
                  />
                </TagSlot>
              ) : null}

              {hasMounted && isLoggedIn && isFilterablePage ? (
                <TagSlot active={activeDuplicatesTag}>
                  <TopChromeChipButton
                    label="Duplicates"
                    active={activeDuplicatesTag}
                    clearable
                    onClick={() => applyTopChromeFilters({ ...filters, duplicatesOnly: !filters.duplicatesOnly })}
                  />
                </TagSlot>
              ) : null}

              {isLoggedIn && isFilterablePage ? (
                <TagSlot active={activeHideOwnedTag}>
                  <TopChromeChipButton
                    label="Hide owned"
                    active={activeHideOwnedTag}
                    clearable
                    onClick={() => applyTopChromeFilters({ ...filters, excludeCollected: !filters.excludeCollected })}
                  />
                </TagSlot>
              ) : null}

              {isLoggedIn && isFilterablePage ? (
                <TagSlot active={activeOwnedOnlyTag}>
                  <TopChromeChipButton
                    label="Owned only"
                    active={activeOwnedOnlyTag}
                    clearable
                    onClick={() => applyTopChromeFilters({ ...filters, showOwnedOnly: !filters.showOwnedOnly })}
                  />
                </TagSlot>
              ) : null}
            </div>
          ) : null}

          {showSealedFilterRow ? <SealedTopChromeFilters /> : null}
        </div>
      </div>

      {menuOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1003] bg-black/55"
              onClick={() => setMenuOpen(false)}
              role="presentation"
            >
              <aside
                className="app-menu-drawer pointer-events-auto h-full w-[min(82vw,22rem)]"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
              >
                <AppDrawerMenu isLoggedIn={isLoggedIn} onClose={() => setMenuOpen(false)} />
              </aside>
            </div>,
            document.body,
          )
        : null}

      {filterSheet && typeof document !== "undefined"
        ? createPortal(
            <FilterSheetModal
              title={sheetConfig[filterSheet].title}
              value={sheetConfig[filterSheet].value}
              options={sheetConfig[filterSheet].options}
              onClose={() => setFilterSheet(null)}
              onApply={(value) => {
                sheetConfig[filterSheet].onApply(value);
                setFilterSheet(null);
              }}
            />,
            document.body,
          )
        : null}

      {/* Modal — full screen, above everything */}
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1001] flex flex-col bg-black"
              style={{
                paddingTop: contentTopOffset,
              }}
              onClickCapture={handleScopedLinkClickCapture}
              onTouchStart={handleModalTouchStart}
              onTouchEnd={handleModalTouchEnd}
              onTouchCancel={resetModalSwipe}
            >
              {/* Scrollable content */}
              <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
                <SearchResultsPanel
                  query={query}
                  recentSearches={recentSearches}
                  onRecentPick={handleRecentPick}
                  results={results}
                  loading={loading}
                  hasResults={Boolean(hasResults)}
                  isLoggedIn={isLoggedIn}
                  priority={getSectionPriority(pathname, searchTab)}
                  cardsHref={buildCardsHref()}
                  setsHref={buildSetsHref()}
                  pokedexHref={buildPokedexHref()}
                  sealedHref={buildSealedHref()}
                  onNavigate={handleNavigate}
                  onCardClick={(card) => {
                    setQuickViewLoading(true);
                    void (async () => {
                      try {
                        const res = await fetch(`/api/card-viewer/${encodeURIComponent(card.masterCardId)}`, {
                          credentials: "include",
                        });
                        if (!res.ok) return;
                        const data = (await res.json()) as {
                          card?: CardEntry;
                          searchCardData?: SearchCardDataPayload | null;
                        };
                        if (!data.card) return;
                        setQuickView({ card: data.card, searchCardData: data.searchCardData ?? null });
                      } catch {
                        // Ignore quick-view fetch failures.
                      } finally {
                        setQuickViewLoading(false);
                      }
                    })();
                  }}
                  onSetClick={(set) => {
                    close();
                    router.push(`/search?set=${encodeURIComponent(set.code)}`);
                  }}
                  onPokemonClick={(p) => {
                    close();
                    router.push(`/search?pokemon=${encodeURIComponent(String(p.nationalDexNumber))}`);
                  }}
                  onSealedClick={(item) => {
                    close();
                    router.push(`/sealed/${encodeURIComponent(String(item.id))}`);
                  }}
                />
              </div>

              {/* Bottom action bar */}
              <ModalBottomBar onClose={close} />
            </div>,
            document.body,
          )
        : null}

      {quickViewLoading ? (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-black/55">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
        </div>
      ) : null}

      {quickView ? (
        <CardGrid
          cards={[quickView.card]}
          customerLoggedIn={isLoggedIn}
          itemConditions={quickView.searchCardData?.itemConditions}
          wishlistEntryIdsByMasterCardId={quickView.searchCardData?.wishlistMap}
          collectionLinesByMasterCardId={quickView.searchCardData?.collectionLines}
          hideGrid
          onModalClose={() => setQuickView(null)}
        />
      ) : null}
    </>
  );
}

// ─── Search results panel ───────────────────────────────────────────────────────

function SearchResultsPanel({
  query,
  recentSearches,
  onRecentPick,
  results,
  loading,
  hasResults,
  isLoggedIn,
  priority,
  cardsHref,
  setsHref,
  pokedexHref,
  sealedHref,
  onNavigate,
  onCardClick,
  onSetClick,
  onPokemonClick,
  onSealedClick,
}: {
  query: string;
  recentSearches: string[];
  onRecentPick: (q: string) => void;
  results: SearchResults | null;
  loading: boolean;
  hasResults: boolean;
  isLoggedIn: boolean;
  priority: SectionKey;
  cardsHref: string;
  setsHref: string;
  pokedexHref: string;
  sealedHref: string;
  onNavigate: () => void;
  onCardClick: (card: CardResult) => void;
  onSetClick: (set: SetResult) => void;
  onPokemonClick: (p: PokemonResult) => void;
  onSealedClick: (item: SealedResult) => void;
}) {
  if (!query || query.trim().length < 2) {
    return (
      <div className="flex w-full flex-col gap-5 px-4 py-8">
        {recentSearches.length > 0 ? (
          <section aria-label="Recent searches">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">Recent</p>
            <ul className="flex flex-col gap-1.5" role="list">
              {recentSearches.map((term) => (
                <li key={term}>
                  <button
                    type="button"
                    onClick={() => onRecentPick(term)}
                    className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-white/85 transition hover:bg-white/10"
                  >
                    <span className="text-white/35" aria-hidden="true">
                      <IconSearch />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{term}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-white/20" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <p className="text-sm text-white/45">Type to search cards, sets, Pokémon, and sealed products</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      </div>
    );
  }

  if (!hasResults) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm text-white/45">No results for &ldquo;{query}&rdquo;</p>
      </div>
    );
  }

  const sectionCards = results && results.cards.length > 0 ? (
    <section key="cards">
      <SectionHeader title="Cards" href={cardsHref} onNavigate={onNavigate} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {results.cards.map((card) => (
          <CardThumb key={card.masterCardId} card={card} onClick={() => onCardClick(card)} />
        ))}
      </div>
    </section>
  ) : null;

  const sectionSets = results && results.sets.length > 0 ? (
    <section key="sets">
      <SectionHeader title="Sets" href={setsHref} onNavigate={onNavigate} />
      <div className="mt-2 flex flex-col gap-2">
        {results.sets.map((set) => (
          <button key={set.code} type="button" onClick={() => onSetClick(set)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
          >
            <img src={set.logoSrc} alt={set.name} className="h-7 w-auto max-w-[80px] object-contain" loading="lazy" />
            <div>
              <div className="text-sm font-medium text-white">{set.name}</div>
              {set.cardCountOfficial ? <div className="text-[11px] text-white/45">{set.cardCountOfficial} cards</div> : null}
            </div>
          </button>
        ))}
      </div>
    </section>
  ) : null;

  const sectionPokedex = results && results.pokemon.length > 0 ? (
    <section key="pokedex">
      <SectionHeader title="Pokédex" href={pokedexHref} onNavigate={onNavigate} />
      <div className="mt-2 flex flex-col gap-2">
        {results.pokemon.map((p) => (
          <button key={p.nationalDexNumber} type="button" onClick={() => onPokemonClick(p)}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
          >
            <img src={p.imageUrl} alt={p.name} className="h-10 w-10 object-contain" loading="lazy" />
            <div>
              <div className="text-sm font-medium text-white">{p.name}</div>
              <div className="text-[11px] text-white/45">#{p.nationalDexNumber}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  ) : null;

  const sectionSealed = results && results.sealed.length > 0 ? (
    <section key="sealed">
      <SectionHeader title="Sealed" href={sealedHref} onNavigate={onNavigate} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {results.sealed.map((item) => (
          <SealedThumb key={item.id} item={item} onClick={() => onSealedClick(item)} />
        ))}
      </div>
    </section>
  ) : null;

  const sectionCollection = isLoggedIn ? (
    results && results.collection.length > 0 ? (
      <section key="collection">
        <SectionHeader title="My Collection" href="/collect" onNavigate={onNavigate} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          {results.collection.map((card) => (
            <CardThumb key={card.masterCardId} card={card} onClick={() => onCardClick(card)} />
          ))}
        </div>
      </section>
    ) : null
  ) : (
    <section key="collection">
      <p className="text-[11px] font-semibold text-white/45">My Collection</p>
      <Link href="/login" onClick={onNavigate}
        className="mt-1.5 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/65 hover:bg-white/10"
      >
        Sign in to search your collection
        <span className="text-white/35">›</span>
      </Link>
    </section>
  );

  const sectionWishlist = isLoggedIn ? (
    results && results.wishlist.length > 0 ? (
      <section key="wishlist">
        <SectionHeader title="Wishlist" href="/wishlist" onNavigate={onNavigate} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          {results.wishlist.map((card) => (
            <CardThumb key={card.masterCardId} card={card} onClick={() => onCardClick(card)} />
          ))}
        </div>
      </section>
    ) : null
  ) : (
    <section key="wishlist">
      <p className="text-[11px] font-semibold text-white/45">Wishlist</p>
      <Link href="/login" onClick={onNavigate}
        className="mt-1.5 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/65 hover:bg-white/10"
      >
        Sign in to search your wishlist
        <span className="text-white/35">›</span>
      </Link>
    </section>
  );

  const defaultOrder: SectionKey[] = ["cards", "sets", "pokedex", "sealed", "collection", "wishlist"];
  const orderedKeys: SectionKey[] = [
    priority,
    ...defaultOrder.filter((k) => k !== priority),
  ];

  const sectionMap: Record<SectionKey, React.ReactNode> = {
    cards: sectionCards,
    sets: sectionSets,
    pokedex: sectionPokedex,
    sealed: sectionSealed,
    collection: sectionCollection,
    wishlist: sectionWishlist,
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {orderedKeys.map((key) => sectionMap[key])}
    </div>
  );
}

function FilterSheetModal({
  title,
  value,
  options,
  onClose,
  onApply,
}: {
  title: string;
  value: string;
  options: { value: string; label: string }[];
  onClose: () => void;
  onApply: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const selectedCount = draftValue ? 1 : 0;

  return (
    <div
      className="fixed inset-0 z-[1004] flex items-end justify-center bg-[var(--foreground)]/45"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="pointer-events-auto w-full max-w-[34rem] rounded-t-[2rem] border border-[var(--foreground)]/15 bg-[var(--background)] text-[var(--foreground)] shadow-[0_-18px_60px_rgba(0,0,0,0.4)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-14 rounded-full bg-[var(--foreground)]/20" />
        </div>
        <div className="flex items-center justify-between border-b border-[var(--foreground)]/12 px-6 pb-5 pt-4">
          <h2 className="text-xl font-semibold">
            {title}
            {selectedCount > 0 ? ` (${selectedCount})` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--foreground)]/70 transition hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)]"
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>

        <div className="max-h-[50dvh] overflow-y-auto px-6 py-3">
          <div className="flex flex-col">
            {options.map((option) => {
              const selected = draftValue === option.value;
              return (
                <button
                  key={option.value || "__empty"}
                  type="button"
                  onClick={() => setDraftValue(option.value)}
                  className="flex items-center gap-4 rounded-xl px-1 py-3 text-left transition hover:bg-[var(--foreground)]/6"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                      selected
                        ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                        : "border-[var(--foreground)]/35 text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  </span>
                  <span className="text-base text-[var(--foreground)]">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))] pt-3">
          <button
            type="button"
            onClick={() => onApply(draftValue)}
            className="w-full rounded-full border border-[var(--foreground)]/20 bg-[var(--foreground)] px-5 py-4 text-lg font-semibold text-[var(--background)] transition hover:opacity-90"
          >
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal bottom bar with swipe-up-to-close ───────────────────────────────────

function ModalBottomBar({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div
      className="shrink-0 bg-black"
      style={{ paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.35rem))", paddingTop: "0.125rem" }}
    >
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 rounded-full border border-white/25 bg-white/[0.04] px-7 py-2 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
        >
          Search
        </button>
        <button
          type="button"
          onClick={onClose}
          className="pb-0.5 text-[11px] text-white/35 hover:text-white/60"
        >
          Slide up to close
        </button>
      </div>
    </div>
  );
}
