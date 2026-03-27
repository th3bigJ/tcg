/**
 * Scrydex English expansion URLs for sets in the Mega Evolution block (card href prefix = `listPrefix`).
 * `mee` is a local-only energy set — not listed on Scrydex.
 */

export type ScrydexExpansionListConfig = {
  expansionUrl: string;
  /** Suffix in `/pokemon/cards/.../{listPrefix}-N` (e.g. me1, sv1, mep). */
  listPrefix: string;
};

/** @deprecated Use `ScrydexExpansionListConfig`. */
export type ScrydexMegaExpansionConfig = ScrydexExpansionListConfig;

/**
 * Resolve Scrydex listing URL from Payload set identifiers (`tcgdexId`, `code`, canonical).
 */
export function scrydexMegaExpansionConfig(
  canonicalSetCode: string,
  legacyCode: string | undefined,
  setTcgdexId: string | undefined,
): ScrydexExpansionListConfig | null {
  const candidates = [canonicalSetCode, legacyCode, setTcgdexId].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  const lowered = new Set(candidates.map((c) => c.trim().toLowerCase()));

  if (lowered.has("mee")) return null;

  if (lowered.has("mep")) {
    return {
      expansionUrl:
        "https://scrydex.com/pokemon/expansions/mega-evolution-black-star-promos/mep",
      listPrefix: "mep",
    };
  }

  if (lowered.has("me02.5") || lowered.has("me2pt5")) {
    return {
      expansionUrl: "https://scrydex.com/pokemon/expansions/ascended-heroes/me2pt5",
      listPrefix: "me2pt5",
    };
  }

  if (lowered.has("me02") || lowered.has("me2")) {
    return {
      expansionUrl: "https://scrydex.com/pokemon/expansions/phantasmal-flames/me2",
      listPrefix: "me2",
    };
  }

  if (lowered.has("me03") || lowered.has("me3")) {
    return {
      expansionUrl: "https://scrydex.com/pokemon/expansions/perfect-order/me3",
      listPrefix: "me3",
    };
  }

  if (lowered.has("me01") || lowered.has("me1")) {
    return {
      expansionUrl: "https://scrydex.com/pokemon/expansions/mega-evolution/me1",
      listPrefix: "me1",
    };
  }

  return null;
}
