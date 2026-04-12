"use client";

import { useState } from "react";
import { ScraperJobButton } from "./ScraperJobButton";

type ScraperDef = {
  label: string;
  endpoint: string;
  body?: Record<string, unknown>;
  description: string;
};

type BrandScrapers = {
  id: string;
  name: string;
  scrapers: ScraperDef[];
};

const BRAND_SCRAPERS: BrandScrapers[] = [
  {
    id: "pokemon",
    name: "Pokémon",
    scrapers: [
      {
        label: "Singles pricing",
        endpoint: "/api/admin/scrapers/pokemon-pricing",
        description: "Scrydex prices for all Pokémon sets → R2",
      },
      {
        label: "Sealed products",
        endpoint: "/api/admin/scrapers/pokemon-products",
        description: "Pokedata catalog & prices → R2",
      },
    ],
  },
  {
    id: "onepiece",
    name: "One Piece",
    scrapers: [
      {
        label: "Singles pricing",
        endpoint: "/api/admin/scrapers/onepiece-pricing",
        body: { source: "r2" },
        description: "Scrydex prices for all sets → R2",
      },
      {
        label: "Sets",
        endpoint: "/api/admin/scrapers/onepiece-sets",
        description: "Discover sets & set images → R2",
      },
      {
        label: "Cards",
        endpoint: "/api/admin/scrapers/onepiece-cards",
        body: { noImages: false },
        description: "Card data per set → R2",
      },
    ],
  },
  {
    id: "lorcana",
    name: "Lorcana",
    scrapers: [
      {
        label: "Singles pricing",
        endpoint: "/api/admin/scrapers/lorcana-pricing",
        body: { source: "r2" },
        description: "Scrydex prices for all sets → R2",
      },
    ],
  },
];

export function ScraperPanel() {
  const [unlocked, setUnlocked] = useState(false);
  const [openBrandId, setOpenBrandId] = useState<string | null>(null);

  function toggleBrand(id: string) {
    setOpenBrandId((prev) => (prev === id ? null : id));
  }

  const openBrand = BRAND_SCRAPERS.find((b) => b.id === openBrandId);

  return (
    <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-700">
      <div className="flex items-start justify-between gap-3 px-4 py-2">
        <div className="min-w-0 flex flex-1 flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Scrapers
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Pick a brand, then run a job. Outputs go to R2. One Piece scripts may stage under{" "}
            <span className="font-mono">data/onepiece/</span> before upload unless{" "}
            <span className="font-mono">SKIP_ONEPIECE_R2</span>. Sealed:{" "}
            <span className="font-mono">SCRAPER_SKIP_LOCAL_DISK=1</span> skips local JSON mirrors.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setUnlocked((u) => !u);
            if (unlocked) setOpenBrandId(null);
          }}
          className={`shrink-0 rounded border px-3 py-1 text-xs font-medium transition-colors ${
            unlocked
              ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-900/20 dark:text-amber-400"
              : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
          }`}
        >
          {unlocked ? "🔓 Lock Scrapers" : "🔒 Unlock Scrapers"}
        </button>
      </div>

      {unlocked && (
        <div className="px-4 pb-4">
          {/* Brand folders */}
          <div className="mb-3 flex flex-wrap gap-2">
            {BRAND_SCRAPERS.map((b) => {
              const isOpen = openBrandId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBrand(b.id)}
                  aria-expanded={isOpen}
                  aria-controls={`scraper-brand-${b.id}`}
                  className={`flex min-w-[8.5rem] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium shadow-sm backdrop-blur-md transition-colors ${
                    isOpen
                      ? "border-blue-400/80 bg-blue-500/15 text-blue-800 dark:border-blue-500/60 dark:bg-blue-500/20 dark:text-blue-100"
                      : "border-neutral-200/80 bg-white/60 text-neutral-800 hover:bg-white/90 dark:border-neutral-600/80 dark:bg-neutral-900/50 dark:text-neutral-100 dark:hover:bg-neutral-800/70"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg
                      className={`h-4 w-4 shrink-0 ${isOpen ? "text-blue-600 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-7l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    {b.name}
                  </span>
                  <span
                    className={`text-neutral-400 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                    aria-hidden
                  >
                    ›
                  </span>
                </button>
              );
            })}
          </div>

          {/* Scrapers for selected brand */}
          {!openBrand && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Select a brand folder above to see scrapers.
            </p>
          )}

          {openBrand && openBrand.scrapers.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300/80 bg-white/40 px-4 py-6 text-center text-sm text-neutral-500 backdrop-blur-sm dark:border-neutral-600/80 dark:bg-neutral-900/30 dark:text-neutral-400">
              No scrapers for {openBrand.name} yet.
            </div>
          )}

          {openBrand && openBrand.scrapers.length > 0 && (
            <div
              id={`scraper-brand-${openBrand.id}`}
              className="overflow-x-auto rounded-xl border border-neutral-200/80 bg-white/40 p-3 backdrop-blur-md dark:border-neutral-700/80 dark:bg-neutral-950/40"
            >
              <div className="flex gap-4" style={{ minWidth: "max-content" }}>
                {openBrand.scrapers.map((s) => (
                  <div key={s.endpoint} className="flex w-64 flex-col gap-1.5">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{s.description}</p>
                    <ScraperJobButton label={s.label} endpoint={s.endpoint} body={s.body} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
