"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export type GradeOpportunity = {
  masterCardId: string;
  cardName: string;
  setName?: string;
  setCode?: string;
  printing?: string;
  lowSrc: string;
  highSrc: string;
  rawGbp: number;
  psa10Gbp: number | null;
  ace10Gbp: number | null;
};

type Grader = "psa" | "ace";

function buildCardHref(opp: GradeOpportunity): string {
  const params = new URLSearchParams();
  if (opp.setCode?.trim()) params.set("set", opp.setCode.trim());
  if (opp.cardName.trim()) params.set("search", opp.cardName.trim());
  const qs = params.toString();
  return qs ? `/cards?${qs}` : "/cards";
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(n);
}

export function GradeOpportunitiesList({
  opportunities,
}: {
  opportunities: GradeOpportunity[];
}) {
  const [grader, setGrader] = useState<Grader>("psa");

  const gradedKey = grader === "psa" ? "psa10Gbp" : "ace10Gbp";

  const filtered = opportunities
    .filter((opp) => {
      const gradedGbp = opp[gradedKey];
      return gradedGbp !== null && gradedGbp > opp.rawGbp;
    })
    .map((opp) => {
      const gradedGbp = opp[gradedKey]!;
      return { ...opp, gradedGbp, profitGbp: gradedGbp - opp.rawGbp };
    })
    .sort((a, b) => b.profitGbp - a.profitGbp)
    .slice(0, 25);

  return (
    <div>
      <div className="mt-4 inline-flex rounded-lg border border-[var(--foreground)]/15 p-0.5">
        <button
          type="button"
          onClick={() => setGrader("psa")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            grader === "psa"
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
          }`}
        >
          PSA 10
        </button>
        <button
          type="button"
          onClick={() => setGrader("ace")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            grader === "ace"
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"
          }`}
        >
          ACE 10
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 max-w-md text-sm text-[var(--foreground)]/70">
          No grading opportunities found for{" "}
          {grader === "psa" ? "PSA 10" : "ACE 10"}. Try switching grader.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {filtered.map((opp) => (
            <Link
              key={`${opp.masterCardId}::${opp.printing ?? ""}`}
              href={buildCardHref(opp)}
              prefetch={false}
              className="flex gap-4 rounded-xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/[0.03] p-3 transition hover:bg-[var(--foreground)]/[0.06]"
            >
              <div className="w-[60px] shrink-0">
                <Image
                  src={opp.highSrc}
                  alt={opp.cardName}
                  width={60}
                  height={84}
                  className="rounded-md object-contain"
                  style={{ height: "auto" }}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <div className="truncate text-sm font-semibold">{opp.cardName}</div>
                {opp.setName ? (
                  <div className="truncate text-xs text-[var(--foreground)]/55">
                    {opp.setName}
                    {opp.printing ? ` · ${opp.printing}` : ""}
                  </div>
                ) : null}
                <div className="mt-2 flex items-end justify-between gap-2 text-xs">
                  <div className="flex gap-6">
                    <div>
                      <div className="text-[var(--foreground)]/50">Raw</div>
                      <div className="font-medium tabular-nums">{fmt(opp.rawGbp)}</div>
                    </div>
                    <div>
                      <div className="text-[var(--foreground)]/50">
                        {grader === "psa" ? "PSA 10" : "ACE 10"}
                      </div>
                      <div className="font-medium tabular-nums">{fmt(opp.gradedGbp)}</div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-emerald-500">
                    +{fmt(opp.profitGbp)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
