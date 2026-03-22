"use client";

import { useState } from "react";

import { ASCENDED_HEROES_SET_CODE } from "@/lib/catalogPricingConstants";

/**
 * Test control: refreshes cached GBP pricing for Ascended Heroes (`me2pt5`) only.
 */
export function RefreshCatalogPricingButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  async function onRefresh() {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/catalog-pricing/refresh", { method: "POST" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        created?: number;
        updated?: number;
        skipped?: number;
        scanned?: number;
        setCode?: string;
      };
      if (!res.ok) {
        setStatus("err");
        setMessage(body.error ?? `Request failed (${res.status})`);
        return;
      }
      setStatus("ok");
      setMessage(
        `Refreshed ${body.setCode ?? "set"}: ${body.created ?? 0} created, ${body.updated ?? 0} updated, ${body.skipped ?? 0} skipped (${body.scanned ?? 0} scanned).`,
      );
    } catch {
      setStatus("err");
      setMessage("Network error");
    }
  }

  return (
    <div className="mt-6 rounded-md border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-4 text-sm">
      <p className="font-medium text-[var(--foreground)]">Catalog pricing (test)</p>
      <p className="mt-1 text-[var(--foreground)]/65">
        Fetches TCGdex prices (GBP) for all cards in Ascended Heroes ({ASCENDED_HEROES_SET_CODE})
        only and saves
        them for faster storefront totals and card modals. Other sets still use the live API.
      </p>
      <button
        type="button"
        disabled={status === "loading"}
        onClick={() => void onRefresh()}
        className="mt-3 rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18 disabled:opacity-50"
      >
        {status === "loading" ? "Refreshing…" : "Refresh Ascended Heroes pricing"}
      </button>
      {message ? (
        <p
          className={`mt-2 text-xs ${status === "err" ? "text-red-600 dark:text-red-400" : "text-[var(--foreground)]/70"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
