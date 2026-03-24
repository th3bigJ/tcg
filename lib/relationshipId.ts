/**
 * Payload’s Postgres adapter uses numeric primary keys for most collections.
 * Relationship field validation (`isValidID`) only accepts `number` for those ids — not numeric strings.
 * Use when writing relationship fields via `payload.create` / `payload.update`, and in `where` clauses
 * that filter by a relationship to those collections.
 */
export function toPayloadRelationshipId(
  value: string | number | undefined | null,
): string | number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (s === "") return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  return s;
}

/** Resolve a Payload relationship field value to a document id string. */
export function getRelationshipDocumentId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") return id;
    if (typeof id === "number") return String(id);
  }
  return null;
}

/**
 * Normalizes a document id for `payload.update` / `payload.delete` with the Postgres adapter:
 * numeric primary keys should stay as numbers so lookups match.
 */
export function toPayloadDocumentId(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = getRelationshipDocumentId(value);
  if (s !== null) {
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (Number.isSafeInteger(n)) return n;
    }
    return s;
  }
  if (typeof value === "string" && value.trim()) {
    const t = value.trim();
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (Number.isSafeInteger(n)) return n;
    }
    return t;
  }
  throw new Error("Invalid Payload document id");
}
