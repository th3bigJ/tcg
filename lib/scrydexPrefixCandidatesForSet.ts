import type { SetJsonEntry } from "@/lib/staticDataTypes";
import { resolveExpansionConfigsForSet } from "@/lib/scrydexExpansionConfigsForSet";
import { getSinglesCatalogSetKey } from "@/lib/singlesCatalogSetKey";

/** Old dotted `setKey` / `?set=` values that still resolve after dual-list sets moved to primary Scrydex prefixes. */
const LEGACY_CATALOG_ALIASES: Record<string, string[]> = {
  swsh12pt5: ["swsh12.5"],
  swsh45: ["swsh4.5"],
};

/** Prefix strings to try when resolving Scrydex listing/detail paths for a set (card id aliases). */
export function buildScrydexPrefixCandidates(set: SetJsonEntry): string[] {
  const catalog = getSinglesCatalogSetKey(set);
  const configs = resolveExpansionConfigsForSet(set);
  const legacy = catalog ? LEGACY_CATALOG_ALIASES[catalog.toLowerCase()] ?? [] : [];
  const raw = [
    ...(catalog ? [catalog] : []),
    ...legacy,
    ...configs.map((c) => c.listPrefix),
  ];
  return [...new Set(raw.map((s) => s.trim()).filter(Boolean))];
}

/** Match CLI `--set=` / filter args against catalog `setKey` and all Scrydex `listPrefix` aliases. */
export function setRowMatchesAllowedSetCodes(set: SetJsonEntry, rawCodes: string[]): boolean {
  if (!rawCodes.length) return true;
  const allowed = new Set(
    rawCodes.map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  return buildScrydexPrefixCandidates(set).some((p) => allowed.has(p.toLowerCase()));
}
