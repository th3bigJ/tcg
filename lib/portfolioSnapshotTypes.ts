export type PortfolioGroupSnapshot = {
  valueGbp: number;
  spentGbp: number;
  soldGbp: number;
};

export type PortfolioSnapshotGroups = {
  single: PortfolioGroupSnapshot;
  graded: PortfolioGroupSnapshot;
  sealed: PortfolioGroupSnapshot;
  ripped: PortfolioGroupSnapshot;
};

export type PortfolioSnapshotPoint = {
  /** UTC calendar date YYYY-MM-DD */
  date: string;
  capturedAt: string;
  totalValueGbp: number;
  groups: PortfolioSnapshotGroups;
};

export type PortfolioSnapshotDocument = {
  version: 1;
  customerId: string;
  updatedAt: string;
  points: PortfolioSnapshotPoint[];
};

export function emptyGroupTotals(): PortfolioGroupSnapshot {
  return { valueGbp: 0, spentGbp: 0, soldGbp: 0 };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseGroup(raw: unknown): PortfolioGroupSnapshot {
  if (!raw || typeof raw !== "object") return emptyGroupTotals();
  const o = raw as Record<string, unknown>;
  return {
    valueGbp: isFiniteNumber(o.valueGbp) ? o.valueGbp : 0,
    spentGbp: isFiniteNumber(o.spentGbp) ? o.spentGbp : 0,
    soldGbp: isFiniteNumber(o.soldGbp) ? o.soldGbp : 0,
  };
}

function parseGroups(raw: unknown): PortfolioSnapshotGroups {
  if (!raw || typeof raw !== "object") {
    const z = emptyGroupTotals();
    return { single: z, graded: z, sealed: z, ripped: z };
  }
  const o = raw as Record<string, unknown>;
  return {
    single: parseGroup(o.single),
    graded: parseGroup(o.graded),
    sealed: parseGroup(o.sealed),
    ripped: parseGroup(o.ripped),
  };
}

/** JSON may store `customerId` as a number — coerce for comparison with `customers.id`. */
function readCustomerIdFromJson(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return "";
}

export function parsePortfolioSnapshotDocument(
  raw: unknown,
  expectedCustomerId: string,
): PortfolioSnapshotDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  const customerId = readCustomerIdFromJson(o.customerId);
  const expected = String(expectedCustomerId).trim();
  if (!customerId || customerId !== expected) return null;
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString();
  const pointsRaw = o.points;
  if (!Array.isArray(pointsRaw)) {
    return { version: 1, customerId, updatedAt, points: [] };
  }
  const points: PortfolioSnapshotPoint[] = [];
  for (const p of pointsRaw) {
    if (!p || typeof p !== "object") continue;
    const pr = p as Record<string, unknown>;
    const date = typeof pr.date === "string" ? pr.date : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const capturedAt = typeof pr.capturedAt === "string" ? pr.capturedAt : new Date().toISOString();
    const totalValueGbp = isFiniteNumber(pr.totalValueGbp) ? pr.totalValueGbp : 0;
    points.push({
      date,
      capturedAt,
      totalValueGbp,
      groups: parseGroups(pr.groups),
    });
  }
  return { version: 1, customerId, updatedAt, points };
}
