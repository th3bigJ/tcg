/**
 * Public set identifier for URLs and filters: prefer TCGdex id, then legacy `code`.
 */
export function resolveCanonicalSetCodeFromFields(params: {
  tcgdexId?: unknown;
  code?: unknown;
}): string {
  const t = typeof params.tcgdexId === "string" ? params.tcgdexId.trim() : "";
  if (t && t !== "unknown") return t;
  const c = typeof params.code === "string" ? params.code.trim() : "";
  if (c && c !== "unknown") return c;
  return "";
}

export function resolveCanonicalSetCodeFromSetRelation(set: unknown): string {
  if (!set || typeof set !== "object" || Array.isArray(set)) return "";
  const row = set as Record<string, unknown>;
  return resolveCanonicalSetCodeFromFields({
    tcgdexId: row.tcgdexId,
    code: row.code,
  });
}
