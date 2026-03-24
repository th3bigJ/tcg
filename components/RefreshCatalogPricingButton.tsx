"use client";

import { useState } from "react";

type ScrydexBody = {
  seriesNames?: string[];
  seriesWarnings?: string[];
  setCodes?: string[];
  masterRows?: number;
  skippedNoScrydexExpansion?: number;
  skippedNoPrice?: number;
  skippedHasTcgdexCatalog?: number;
  masterMarkedPricingOk?: number;
  masterMarkedNoPricing?: number;
  created?: number;
  updated?: number;
  errors?: string[];
};

/**
 * Account-page control: full Scrydex scrape for configured series (expansion list + card pages).
 */
export function RefreshCatalogPricingButton() {
  const [phase, setPhase] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  async function onRefresh() {
    setPhase("loading");
    setMessage("Scraping Scrydex (expansion lists + card pages)…");
    try {
      const res = await fetch("/api/catalog-pricing/refresh", { method: "POST" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        seriesNames?: string[];
        seriesWarnings?: string[];
        scrydex?: ScrydexBody;
      };
      if (!res.ok) {
        setPhase("err");
        setMessage(body.error ?? `Request failed (${res.status})`);
        return;
      }
      const scrydex = body.scrydex;
      const series =
        Array.isArray(body.seriesNames) && body.seriesNames.length > 0
          ? body.seriesNames.join(", ")
          : "all sets (all series)";
      const sets =
        Array.isArray(scrydex?.setCodes) && scrydex.setCodes.length > 0
          ? scrydex.setCodes.join(", ")
          : "(no sets)";

      const line = scrydex
        ? `${series} — sets touched: ${sets}. Queued ${scrydex.masterRows ?? 0} master row(s). Catalog +${scrydex.created ?? 0} / ~${scrydex.updated ?? 0}. Skipped: no expansion ${scrydex.skippedNoScrydexExpansion ?? 0}, no price ${scrydex.skippedNoPrice ?? 0}, TCGdex-only skip ${scrydex.skippedHasTcgdexCatalog ?? 0}. Master no_pricing → false: ${scrydex.masterMarkedPricingOk ?? 0}, → true: ${scrydex.masterMarkedNoPricing ?? 0}.`
        : "Scrydex: (no stats)";

      const warnSeries =
        Array.isArray(body.seriesWarnings) && body.seriesWarnings.length > 0
          ? `\nSeries warnings:\n${body.seriesWarnings.map((w) => `• ${w}`).join("\n")}`
          : "";

      const errSample =
        Array.isArray(scrydex?.errors) && scrydex.errors.length > 0
          ? `\nErrors (sample): ${scrydex.errors.slice(0, 6).join("; ")}`
          : "";

      setPhase("ok");
      setMessage(`${line}${warnSeries}${errSample}`);
    } catch {
      setPhase("err");
      setMessage("Network error");
    }
  }

  const loading = phase === "loading";
  return (
    <div className="mt-6 rounded-md border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-4 text-sm">
      <p className="font-medium text-[var(--foreground)]">Catalog pricing (test)</p>
      <p className="mt-1 text-[var(--foreground)]/65">
        Scrapes Scrydex for <strong>every set</strong> in the database whose tcgdx id is mapped (ME, SV,
        Sword &amp; Shield, Sun &amp; Moon, XY, etc. — see <code className="text-xs">lib/scrydexBulkExpansionUrls.ts</code>
        ). Per-set expansion pages + card detail charts. Updates{" "}
        <span className="whitespace-nowrap">catalog-card-pricing</span> and{" "}
        <span className="whitespace-nowrap">master-card-list.no_pricing</span>.
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={() => void onRefresh()}
        className="mt-3 rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18 disabled:opacity-50"
      >
        {loading ? "Scraping Scrydex…" : "Refresh catalog pricing (Scrydex)"}
      </button>
      {message ? (
        <p
          className={`mt-2 whitespace-pre-line text-xs ${phase === "err" ? "text-red-600 dark:text-red-400" : "text-[var(--foreground)]/70"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
