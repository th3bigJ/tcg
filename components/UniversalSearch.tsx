"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TOP_CHROME_HIDDEN_TRANSFORM, TOP_CHROME_VISIBLE_TRANSFORM } from "@/lib/chromeVisibility";
import {
  buildPokedexDetailHref,
  type SortOrder,
  DEFAULT_SORT,
  persistFilters,
  readPersistedFilters,
  type PersistedFilterScope,
} from "@/lib/persistedFilters";
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

type SearchResults = {
  cards: CardResult[];
  sets: SetResult[];
  pokemon: PokemonResult[];
  collection: CardResult[];
  wishlist: CardResult[];
};

type Filters = {
  rarity: string;
  energy: string;
  excludeCommonUncommon: boolean;
  excludeCollected: boolean;
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

function IconFilter() {
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
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="11" y1="18" x2="13" y2="18" />
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
      className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/55"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// ─── Filter select ──────────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-white/65">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-white/14 bg-white/[0.06] px-3 py-2.5 pr-10 text-sm text-white outline-none transition focus:border-white/35 focus:bg-white/[0.09] [appearance:none] [-webkit-appearance:none]"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <IconChevronDown />
      </div>
    </div>
  );
}

function FilterSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-white/90">{title}</h3>
        {description ? <p className="mt-0.5 text-[11px] leading-4 text-white/42">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function FilterToggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-left transition hover:border-white/20 hover:bg-white/[0.05]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-white/30"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-5 text-white/92">{label}</span>
        {description ? <span className="mt-0.5 block text-[11px] leading-4 text-white/42">{description}</span> : null}
      </span>
    </label>
  );
}

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

// ─── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  query,
  href,
  onNavigate,
}: {
  title: string;
  query: string;
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

type SectionKey = "cards" | "sets" | "pokedex" | "collection" | "wishlist";

function getSectionPriority(pathname: string): SectionKey {
  if (pathname.startsWith("/collect/shared")) return "collection";
  if (pathname.startsWith("/collect")) return "collection";
  if (pathname.startsWith("/wishlist")) return "wishlist";
  if (pathname.startsWith("/expansions")) return "sets";
  if (pathname.startsWith("/pokedex")) return "pokedex";
  return "cards";
}

export function UniversalSearch({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const searchTab = searchParams?.get("tab") ?? "cards";
  const filterScope: PersistedFilterScope | undefined =
    pathname.startsWith("/collect/shared")
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
  const inputRef = useRef<HTMLInputElement>(null);
  const modalTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const modalSwipeEligibleRef = useRef(false);
  const [query, setQuery] = useState("");
  const [modalMode, setModalMode] = useState<"closed" | "search" | "filters">("closed");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
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
    category: "",
    missingOnly: false,
    groupBySet: false,
    showOwnedOnly: false,
    sort: DEFAULT_SORT,
  });

  const setFiltersAndPersist = (next: Filters) => {
    setFilters(next);
    persistFilters(next, filterScope);
  };

  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => {
    const syncPersistedFilters = () => {
      const persisted = readPersistedFilters(filterScope);
      const nextFilters: Filters = {
        rarity: persisted.rarity ?? "",
        energy: persisted.energy ?? "",
        excludeCommonUncommon: persisted.excludeCommonUncommon ?? false,
        excludeCollected: persisted.excludeCollected ?? false,
        category: persisted.category ?? "",
        missingOnly: persisted.missingOnly ?? false,
        groupBySet: persisted.groupBySet ?? false,
        showOwnedOnly: persisted.showOwnedOnly ?? false,
        sort: persisted.sort ?? DEFAULT_SORT,
      };

      if (/^\/expansions\/[^/]+/.test(pathname) || /^\/pokedex\/[^/]+/.test(pathname)) {
        nextFilters.rarity = searchParams?.get("rarity") ?? "";
        nextFilters.energy = searchParams?.get("energy") ?? "";
        nextFilters.category = searchParams?.get("category") ?? "";
        nextFilters.excludeCommonUncommon = searchParams?.get("exclude_cu") === "1";
        nextFilters.excludeCollected = searchParams?.get("exclude_owned") === "1";
        nextFilters.groupBySet = searchParams?.get("group_by_set") === "1";
      } else if (pathname.startsWith("/search")) {
        const tab = searchParams?.get("tab") ?? "cards";
        if (tab === "cards") {
          nextFilters.rarity = searchParams?.get("rarity") ?? "";
          nextFilters.energy = searchParams?.get("energy") ?? "";
          nextFilters.category = searchParams?.get("category") ?? "";
          nextFilters.excludeCommonUncommon = searchParams?.get("exclude_cu") === "1";
          nextFilters.excludeCollected = searchParams?.get("exclude_owned") === "1";
          nextFilters.missingOnly = false;
        } else if (tab === "pokedex") {
          nextFilters.missingOnly = searchParams?.get("missing_only") === "1";
          nextFilters.rarity = "";
          nextFilters.energy = "";
          nextFilters.category = "";
          nextFilters.excludeCommonUncommon = false;
          nextFilters.excludeCollected = false;
        }
      } else if (pathname === "/collect" || pathname === "/wishlist") {
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
  }, [filterScope, pathname, searchParams]);

  useEffect(() => {
    if (!filterScope) return;

    const persisted = readPersistedFilters(filterScope);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const activeSearchTab = params.get("tab") ?? "cards";
    let changed = false;

    if (pathname === "/collect" || pathname === "/wishlist") {
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
  }, [filterScope, pathname, router, searchParams]);

  // Intercept all link clicks and inject active filters into filterable page URLs
  useEffect(() => {
    function injectFilters(rawHref: string): string | null {
      let url: URL;
      try { url = new URL(rawHref, window.location.origin); } catch { return null; }
      if (url.origin !== window.location.origin) return null;
      const path = url.pathname;
      const f = filtersRef.current;
      const hasFilters = f.rarity || f.energy || f.excludeCommonUncommon || f.excludeCollected || f.category;

      if (/^\/expansions\/[^/]+/.test(path)) {
        if (f.rarity) url.searchParams.set("rarity", f.rarity); else url.searchParams.delete("rarity");
        if (f.energy) url.searchParams.set("energy", f.energy); else url.searchParams.delete("energy");
        if (f.excludeCommonUncommon) url.searchParams.set("exclude_cu", "1"); else url.searchParams.delete("exclude_cu");
        if (f.excludeCollected) url.searchParams.set("exclude_owned", "1"); else url.searchParams.delete("exclude_owned");
        if (f.category) url.searchParams.set("category", f.category); else url.searchParams.delete("category");
        return url.pathname + (url.search || "");
      }

      if (/^\/pokedex\/[^/]+/.test(path)) {
        if (f.energy) url.searchParams.set("energy", f.energy); else url.searchParams.delete("energy");
        if (f.rarity) url.searchParams.set("rarity", f.rarity); else url.searchParams.delete("rarity");
        if (f.excludeCommonUncommon) url.searchParams.set("exclude_cu", "1"); else url.searchParams.delete("exclude_cu");
        if (f.excludeCollected) url.searchParams.set("exclude_owned", "1"); else url.searchParams.delete("exclude_owned");
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
          if (f.category) url.searchParams.set("category", f.category); else url.searchParams.delete("category");
          return url.pathname + (url.search || "");
        }
        if (tab === "pokedex" && f.missingOnly) {
          url.searchParams.set("missing_only", "1");
          return url.pathname + (url.search || "");
        }
      }

      return null;
    }

    function handleClick(e: MouseEvent) {
      const anchor = (e.target as Element).closest("a");
      if (!anchor || !anchor.href || anchor.target === "_blank") return;
      const rewritten = injectFilters(anchor.href);
      if (!rewritten) return;
      // Only intercept if the URL actually changed
      const current = anchor.pathname + anchor.search;
      if (rewritten === current) return;
      e.preventDefault();
      router.push(rewritten);
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [router]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load facets once on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/universal-search?facets=1", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as FacetOptions;
        setFacets(data);
      } catch {
        // silently ignore
      }
    })();
  }, []);

  // Run search with debounce
  const runSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.trim().length < 2) {
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(() => {
        void (async () => {
          try {
            const res = await fetch(`/api/universal-search?q=${encodeURIComponent(q)}`, {
              credentials: "include",
            });
            if (!res.ok) return;
            const data = (await res.json()) as SearchResults;
            setResults(data);
          } catch {
            // silently ignore
          } finally {
            setLoading(false);
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

  const openSearch = () => {
    setModalMode("search");
  };

  const openFilters = () => {
    setModalMode("filters");
  };

  const close = useCallback(() => {
    setModalMode("closed");
    setQuery("");
    setResults(null);
  }, []);

  const applyAndClose = () => {
    const href = buildCurrentPageHref();
    if (href) router.push(href);
    close();
  };

  const applyFilters = () => {
    persistFilters(filters, filterScope);
    if (isFilterablePage) {
      if (pathname === "/collect" || pathname === "/wishlist") {
        const href = buildCurrentPageHref();
        if (href) {
          router.replace(href, { scroll: false });
          close();
          return;
        }
      }
      applyAndClose();
      return;
    }
    close();
  };

  const handleNavigate = () => {
    close();
  };

  // Build href for the current page with filters applied
  function buildCurrentPageHref() {
    const expansionMatch = pathname.match(/^\/expansions\/([^/]+)/);
    const pokedexDetailMatch = pathname.match(/^\/pokedex\/([^/]+)/);

    if (expansionMatch) {
      const p = new URLSearchParams();
      if (query) p.set("search", query);
      if (filters.rarity) p.set("rarity", filters.rarity);
      if (filters.energy) p.set("energy", filters.energy);
      if (filters.excludeCommonUncommon) p.set("exclude_cu", "1");
      if (filters.excludeCollected) p.set("exclude_owned", "1");
      if (filters.category) p.set("category", filters.category);
      const s = p.toString();
      return s ? `/expansions/${expansionMatch[1]}?${s}` : `/expansions/${expansionMatch[1]}`;
    }

    if (pokedexDetailMatch) {
      const p = new URLSearchParams();
      if (filters.energy) p.set("energy", filters.energy);
      if (filters.rarity) p.set("rarity", filters.rarity);
      if (filters.excludeCommonUncommon) p.set("exclude_cu", "1");
      if (filters.excludeCollected) p.set("exclude_owned", "1");
      if (filters.category) p.set("category", filters.category);
      if (filters.groupBySet) p.set("group_by_set", "1");
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
      if (seed) p.set("seed", seed);
      if (tab === "cards") {
        if (query) p.set("search", query);
        if (filters.rarity) p.set("rarity", filters.rarity);
        if (filters.energy) p.set("energy", filters.energy);
        if (filters.excludeCommonUncommon) p.set("exclude_cu", "1");
        if (filters.excludeCollected) p.set("exclude_owned", "1");
        if (filters.category) p.set("category", filters.category);
      } else if (tab === "pokedex") {
        if (filters.missingOnly) p.set("missing_only", "1");
      }
      return `/search?${p.toString()}`;
    }

    if (pathname === "/collect" || pathname === "/wishlist") {
      const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      p.delete("take");
      p.delete("set_take");
      if (filters.groupBySet) p.set("group_by_set", "1");
      else p.delete("group_by_set");
      const s = p.toString();
      return s ? `${pathname}?${s}` : pathname;
    }

    return null;
  }

  // Build href for "view all" links, carrying query + filters
  function buildCardsHref() {
    const p = new URLSearchParams();
    if (query) p.set("search", query);
    if (filters.rarity) p.set("rarity", filters.rarity);
    if (filters.energy) p.set("energy", filters.energy);
    if (filters.excludeCommonUncommon) p.set("exclude_cu", "1");
    if (filters.excludeCollected) p.set("exclude_owned", "1");
    if (filters.category) p.set("category", filters.category);
    const s = p.toString();
    return s ? `/search?tab=cards&${s}` : "/search?tab=cards";
  }

  function buildSetsHref() {
    const p = new URLSearchParams();
    if (query) p.set("search", query);
    const s = p.toString();
    return s ? `/search?tab=sets&${s}` : "/search?tab=sets";
  }

  function buildPokedexHref() {
    const p = new URLSearchParams();
    if (query) p.set("search", query);
    if (filters.missingOnly) p.set("missing_only", "1");
    const s = p.toString();
    return s ? `/search?tab=pokedex&${s}` : "/search?tab=pokedex";
  }

  const isFilterablePage =
    /^\/expansions\/[^/]+/.test(pathname) ||
    /^\/pokedex\/[^/]+/.test(pathname) ||
    pathname.startsWith("/search") ||
    pathname === "/collect" ||
    pathname === "/wishlist";
  const hasResults =
    results &&
    (results.cards.length > 0 ||
      results.sets.length > 0 ||
      results.pokemon.length > 0 ||
      results.collection.length > 0 ||
      results.wishlist.length > 0);

  const activeFilterCount =
    (filters.rarity ? 1 : 0) +
    (filters.energy ? 1 : 0) +
    (filters.excludeCommonUncommon ? 1 : 0) +
    (filters.excludeCollected ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.missingOnly ? 1 : 0) +
    (filters.groupBySet ? 1 : 0) +
    (filters.showOwnedOnly ? 1 : 0);

  const isOpen = modalMode !== "closed";
  const chromeVisible = useAutoHideChrome({ disabled: isOpen });

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
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen]);

  return (
    <>
      {/* Search bar shell — styled like BottomNav */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[1002] isolate transition-transform duration-200 ease-out"
        style={{
          padding: "max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) 1.25rem 0.5rem",
          transform: chromeVisible ? TOP_CHROME_VISIBLE_TRANSFORM : TOP_CHROME_HIDDEN_TRANSFORM,
        }}
      >
        <div
          className="pointer-events-auto mx-auto flex items-center gap-2"
          style={{
            height: "3.25rem",
            maxWidth: "34rem",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#000",
            padding: "0 0.625rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          {/* Search input area — live input when open, tap target when closed */}
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
                placeholder="Search cards, sets, Pokémon…"
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
                {query || "Search cards, sets, Pokémon…"}
              </button>
            )}
            {isOpen && query ? (
              <button
                type="button"
                onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}
                className="text-white/45 hover:text-white"
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>

          {/* Camera button */}
          <Link
            href="/scan"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
            aria-label="Scan card"
          >
            <IconCamera />
          </Link>

          {/* Filter button */}
          <button
            type="button"
            onClick={openFilters}
            className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
            aria-label="Open filters"
          >
            <IconFilter />
            {activeFilterCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-black">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Modal — full screen, above everything */}
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1001] flex flex-col bg-black"
              style={{ paddingTop: "calc(max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.25rem)) + 3.25rem + 0.75rem)" }}
              onTouchStart={handleModalTouchStart}
              onTouchEnd={handleModalTouchEnd}
              onTouchCancel={resetModalSwipe}
            >
              {/* Scrollable content */}
              <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
                {modalMode === "filters" ? (
                  <FiltersPanel
                    filters={filters}
                    facets={facets}
                    isLoggedIn={isLoggedIn}
                    onChange={(next) => setFiltersAndPersist(next)}
                  />
                ) : (
                  <SearchResultsPanel
                    query={query}
                    results={results}
                    loading={loading}
                    hasResults={Boolean(hasResults)}
                    isLoggedIn={isLoggedIn}
                    priority={getSectionPriority(pathname)}
                    cardsHref={buildCardsHref()}
                    setsHref={buildSetsHref()}
                    pokedexHref={buildPokedexHref()}
                    onNavigate={handleNavigate}
                    onCardClick={(card) => {
                      close();
                      router.push(`/search?tab=cards&search=${encodeURIComponent(card.cardName)}`);
                    }}
                    onSetClick={(set) => {
                      close();
                      router.push(`/expansions/${encodeURIComponent(set.code)}`);
                    }}
                    onPokemonClick={(p) => {
                      close();
                      router.push(buildPokedexDetailHref(p.nationalDexNumber));
                    }}
                  />
                )}
              </div>

              {/* Bottom action bar */}
              <ModalBottomBar mode={modalMode} activeFilterCount={activeFilterCount} onClose={close} onApply={applyFilters} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ─── Filters panel ──────────────────────────────────────────────────────────────

function FiltersPanel({
  filters,
  facets,
  isLoggedIn,
  onChange,
}: {
  filters: Filters;
  facets: FacetOptions;
  isLoggedIn: boolean;
  onChange: (f: Filters) => void;
}) {
  const hasActive =
    filters.rarity ||
    filters.energy ||
    filters.excludeCommonUncommon ||
    filters.excludeCollected ||
    filters.category ||
    filters.missingOnly ||
    filters.groupBySet ||
    filters.showOwnedOnly;

  const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
    { value: "price-desc", label: "Price: high to low" },
    { value: "price-asc", label: "Price: low to high" },
    { value: "release-desc", label: "Release date: newest first" },
    { value: "release-asc", label: "Release date: oldest first" },
    { value: "number-desc", label: "Card number: high to low" },
    { value: "number-asc", label: "Card number: low to high" },
  ];

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-white/90">Filter options</span>
          <p className="mt-0.5 text-[11px] text-white/42">Refine what shows up in this view.</p>
        </div>
        {hasActive ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                rarity: "",
                energy: "",
                excludeCommonUncommon: false,
                excludeCollected: false,
                category: "",
                missingOnly: false,
                groupBySet: false,
                showOwnedOnly: false,
                sort: filters.sort,
              })
            }
            className="inline-flex min-h-10 items-center rounded-full border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/15 hover:text-red-200"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <FilterSection
        title="Sort"
        description="Choose the order cards appear in."
      >
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-white/65">Sort by</label>
          <div className="relative">
            <select
              value={filters.sort}
              onChange={(e) => onChange({ ...filters, sort: e.target.value as SortOrder })}
            className="min-h-11 w-full rounded-lg border border-white/14 bg-black/30 px-3 py-2.5 pr-10 text-sm text-white outline-none transition focus:border-white/35 focus:bg-white/[0.05] [appearance:none] [-webkit-appearance:none]"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <IconChevronDown />
          </div>
        </div>
      </FilterSection>

      <FilterSection
        title="Card details"
          description="Filter by printed attributes."
      >
        <FilterSelect
          label="Rarity"
          value={filters.rarity}
          onChange={(v) => onChange({ ...filters, rarity: v })}
          options={facets.rarityOptions}
          placeholder="All rarities"
        />

        <FilterSelect
          label="Energy type"
          value={filters.energy}
          onChange={(v) => onChange({ ...filters, energy: v })}
          options={facets.energyOptions}
          placeholder="All energy types"
        />

        <FilterSelect
          label="Card type"
          value={filters.category}
          onChange={(v) => onChange({ ...filters, category: v })}
          options={facets.categoryOptions}
          placeholder="All card types"
        />

        <FilterToggle
          checked={filters.excludeCommonUncommon}
          onChange={(checked) => onChange({ ...filters, excludeCommonUncommon: checked })}
          label="Rare+ only"
          description="Exclude Common and Uncommon cards."
        />
      </FilterSection>

      {isLoggedIn ? (
        <FilterSection
          title="Collection view"
          description="Control how collection pages are shown."
        >
          <FilterToggle
            checked={filters.excludeCollected}
            onChange={(checked) => onChange({ ...filters, excludeCollected: checked })}
            label="Hide cards I own"
            description="Useful for wishlists and missing-card browsing."
          />

          <FilterToggle
            checked={filters.groupBySet}
            onChange={(checked) => onChange({ ...filters, groupBySet: checked })}
            label="Group by set"
            description="Show cards in set sections."
          />

          <FilterToggle
            checked={filters.showOwnedOnly}
            onChange={(checked) => onChange({ ...filters, showOwnedOnly: checked })}
            label="Show cards I own"
            description="Only show cards already in your collection."
          />
        </FilterSection>
      ) : null}

      {isLoggedIn ? (
        <FilterSection
          title="Pokédex"
          description="Extra options for the Pokédex tab."
        >
          <FilterToggle
            checked={filters.missingOnly}
            onChange={(checked) => onChange({ ...filters, missingOnly: checked })}
            label="Missing only"
            description="Hide Pokémon you’ve already collected."
          />
        </FilterSection>
      ) : null}
    </div>
  );
}

// ─── Search results panel ───────────────────────────────────────────────────────

function SearchResultsPanel({
  query,
  results,
  loading,
  hasResults,
  isLoggedIn,
  priority,
  cardsHref,
  setsHref,
  pokedexHref,
  onNavigate,
  onCardClick,
  onSetClick,
  onPokemonClick,
}: {
  query: string;
  results: SearchResults | null;
  loading: boolean;
  hasResults: boolean;
  isLoggedIn: boolean;
  priority: SectionKey;
  cardsHref: string;
  setsHref: string;
  pokedexHref: string;
  onNavigate: () => void;
  onCardClick: (card: CardResult) => void;
  onSetClick: (set: SetResult) => void;
  onPokemonClick: (p: PokemonResult) => void;
}) {
  if (!query || query.trim().length < 2) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 text-white/20" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <p className="text-sm text-white/45">Type to search cards, sets, and Pokémon</p>
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
      <SectionHeader title="Cards" query={query} href={cardsHref} onNavigate={onNavigate} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {results.cards.map((card) => (
          <CardThumb key={card.masterCardId} card={card} onClick={() => onCardClick(card)} />
        ))}
      </div>
    </section>
  ) : null;

  const sectionSets = results && results.sets.length > 0 ? (
    <section key="sets">
      <SectionHeader title="Sets" query={query} href={setsHref} onNavigate={onNavigate} />
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
      <SectionHeader title="Pokédex" query={query} href={pokedexHref} onNavigate={onNavigate} />
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

  const sectionCollection = isLoggedIn ? (
    results && results.collection.length > 0 ? (
      <section key="collection">
        <SectionHeader title="My Collection" query={query} href="/collect" onNavigate={onNavigate} />
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
        <SectionHeader title="Wishlist" query={query} href="/wishlist" onNavigate={onNavigate} />
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

  const defaultOrder: SectionKey[] = ["cards", "sets", "pokedex", "collection", "wishlist"];
  const orderedKeys: SectionKey[] = [
    priority,
    ...defaultOrder.filter((k) => k !== priority),
  ];

  const sectionMap: Record<SectionKey, React.ReactNode> = {
    cards: sectionCards,
    sets: sectionSets,
    pokedex: sectionPokedex,
    collection: sectionCollection,
    wishlist: sectionWishlist,
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {orderedKeys.map((key) => sectionMap[key])}
    </div>
  );
}

// ─── Modal bottom bar with swipe-up-to-close ───────────────────────────────────

function ModalBottomBar({
  mode,
  activeFilterCount,
  onClose,
  onApply,
}: {
  mode: "search" | "filters";
  activeFilterCount: number;
  onClose: () => void;
  onApply?: () => void;
}) {
  return (
    <div
      className="shrink-0 bg-black"
      style={{ paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.35rem))", paddingTop: "0.125rem" }}
    >
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={mode === "filters" ? (onApply ?? onClose) : onClose}
          className="min-h-10 rounded-full border border-white/25 bg-white/[0.04] px-7 py-2 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-95"
        >
          {mode === "filters"
            ? `Apply${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}`
            : "Search"}
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
