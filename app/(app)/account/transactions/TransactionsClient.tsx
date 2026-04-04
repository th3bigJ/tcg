"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { productTypeSupportsSealedState } from "@/lib/referenceData";
import {
  type FourWayCategory,
  transactionFourWayCategoryFromProductTypeId,
} from "@/lib/transactionFourWay";

// ── Types ────────────────────────────────────────────────────────────────────

type ProductTypeOption = {
  id: string;
  name: string;
  slug: string;
};

type TransactionDoc = {
  id: string | number;
  direction: "purchase" | "sale";
  description: string;
  quantity: number;
  unitPrice: number;
  transactionDate: string;
  notes?: string | null;
  masterCardId?: string | null;
  sealedState?: "sealed" | "opened" | null;
  sourceReference?: string | null;
  productType: { id: string | number; name?: string } | string | number | null;
};

type Period = "all" | "year" | "month";

// ── Helpers ──────────────────────────────────────────────────────────────────

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function fmt(n: number) {
  return gbp.format(n);
}

function filterByPeriod(docs: TransactionDoc[], period: Period): TransactionDoc[] {
  if (period === "all") return docs;
  const now = new Date();
  return docs.filter((d) => {
    const dt = new Date(d.transactionDate);
    if (period === "year") return dt.getFullYear() === now.getFullYear();
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  });
}

function productTypeName(pt: TransactionDoc["productType"]): string {
  if (!pt) return "—";
  if (typeof pt === "object" && "name" in pt) return pt.name ?? "—";
  return "—";
}

function productTypeId(pt: TransactionDoc["productType"]): string {
  if (!pt) return "";
  if (typeof pt === "object" && "id" in pt) return String(pt.id);
  return String(pt);
}

function transactionFourWayCategory(doc: TransactionDoc): FourWayCategory {
  return transactionFourWayCategoryFromProductTypeId(productTypeId(doc.productType), doc.sealedState);
}

function fourWayTxnChipLabel(cat: FourWayCategory): string {
  if (cat === "single") return "Single";
  if (cat === "graded") return "Graded";
  if (cat === "sealed") return "Sealed";
  return "Ripped";
}

const PRODUCT_TYPE_CHIP_KEYS = new Set([
  "single-card",
  "graded-card",
  "booster-pack",
  "elite-trainer-box",
  "booster-box",
  "collection-box",
  "tin",
  "premium-collection",
  "other",
]);

/** Maps to `txn-product-type--*` classes in `globals.css`. */
function productTypeChipClass(pt: TransactionDoc["productType"]): string {
  const raw = productTypeId(pt);
  const key = raw && PRODUCT_TYPE_CHIP_KEYS.has(raw) ? raw : "other";
  return `txn-product-type txn-product-type--${key}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ── Form state ───────────────────────────────────────────────────────────────

type FormState = {
  direction: "purchase" | "sale";
  productTypeId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  transactionDate: string;
  notes: string;
  sourceReference: string;
  /** Empty = unset (stored as null). Only used when product type supports sealed inventory. */
  sealedState: "" | "sealed" | "opened";
};

function blankForm(): FormState {
  return {
    direction: "purchase",
    productTypeId: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    transactionDate: todayIso(),
    notes: "",
    sourceReference: "",
    sealedState: "",
  };
}

function buildPrefillForm(searchParams: URLSearchParams): FormState | null {
  const description = searchParams.get("description")?.trim() ?? "";
  if (!description) return null;

  const directionParam = searchParams.get("direction");
  const sealedStateParam = searchParams.get("sealedState");
  const productTypeId = searchParams.get("productTypeId")?.trim() ?? "";

  return {
    direction: directionParam === "sale" ? "sale" : "purchase",
    productTypeId,
    description,
    quantity: searchParams.get("quantity")?.trim() || "1",
    unitPrice: searchParams.get("unitPrice")?.trim() || "",
    transactionDate: searchParams.get("transactionDate")?.trim() || todayIso(),
    notes: searchParams.get("notes")?.trim() || "",
    sourceReference: searchParams.get("sourceReference")?.trim() || "",
    sealedState:
      sealedStateParam === "sealed" || sealedStateParam === "opened"
        ? sealedStateParam
        : "",
  };
}

function formFromDoc(doc: TransactionDoc): FormState {
  const ss = doc.sealedState;
  return {
    direction: doc.direction,
    productTypeId: productTypeId(doc.productType),
    description: doc.description,
    quantity: String(doc.quantity),
    unitPrice: String(doc.unitPrice),
    transactionDate: doc.transactionDate ? doc.transactionDate.slice(0, 10) : todayIso(),
    notes: doc.notes ?? "",
    sourceReference: doc.sourceReference ?? "",
    sealedState: ss === "sealed" || ss === "opened" ? ss : "",
  };
}

// ── Shared form fields ───────────────────────────────────────────────────────

function TransactionForm({
  form,
  setForm,
  productTypes,
  onSubmit,
  onCancel,
  pending,
  submitLabel,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  productTypes: ProductTypeOption[];
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  const inputCls =
    "rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/15";

  return (
    <div className="flex flex-col gap-3">
      {/* Direction */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Direction</span>
        <div className="flex gap-2">
          {(["purchase", "sale"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setForm({ ...form, direction: d })}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                form.direction === d
                  ? "border-[var(--foreground)]/50 bg-[var(--foreground)]/15"
                  : "border-[var(--foreground)]/20 bg-transparent opacity-60"
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </label>

      {/* Product type */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Product type (optional)</span>
        <select
          value={form.productTypeId}
          onChange={(e) => {
            const productTypeId = e.target.value;
            const next: FormState = { ...form, productTypeId };
            if (!productTypeSupportsSealedState(productTypeId)) next.sealedState = "";
            setForm(next);
          }}
          className={inputCls}
        >
          <option value="">— Select —</option>
          {productTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>
              {pt.name}
            </option>
          ))}
        </select>
      </label>

      {productTypeSupportsSealedState(form.productTypeId) ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Sealed product</span>
          <select
            value={form.sealedState}
            onChange={(e) =>
              setForm({
                ...form,
                sealedState: e.target.value as FormState["sealedState"],
              })
            }
            className={inputCls}
          >
            <option value="">— Not set —</option>
            <option value="sealed">Sealed</option>
            <option value="opened">Opened</option>
          </select>
          <span className="text-[11px] leading-snug text-[var(--foreground)]/45">
            For packs, boxes, and other sealed products. Leave unset if unknown.
          </span>
        </label>
      ) : null}

      {/* Description */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Description</span>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Card name or product description"
          className={inputCls}
        />
      </label>

      <div className="flex gap-2">
        {/* Quantity */}
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Qty</span>
          <input
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className={inputCls}
          />
        </label>

        {/* Unit price */}
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Unit price (£)</span>
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder="0.00"
            value={form.unitPrice}
            onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
            className={inputCls}
          />
        </label>
      </div>

      {/* Date */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Date</span>
        <input
          type="date"
          value={form.transactionDate}
          onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
          className={inputCls}
        />
      </label>

      {/* Notes */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Notes (optional)</span>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Any extra details…"
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-[var(--foreground)]/25 px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || !form.description.trim()}
          onClick={onSubmit}
          className="flex-1 rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function TransactionsClient({ productTypes }: { productTypes: ProductTypeOption[] }) {
  const searchParams = useSearchParams();
  const [docs, setDocs] = useState<TransactionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");

  // New transaction form
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<FormState>(blankForm);
  const [newPending, setNewPending] = useState(false);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(blankForm);
  const [editPending, setEditPending] = useState(false);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [prefillApplied, setPrefillApplied] = useState(false);

  // ── Load transactions + collection value ──────────────────────────────────

  const [collectionValue, setCollectionValue] = useState<number | null>(null);
  const [singleCardsCollectionValue, setSingleCardsCollectionValue] = useState<number | null>(null);
  const [gradedCardsCollectionValue, setGradedCardsCollectionValue] = useState<number | null>(null);
  const [rippedCollectionValue, setRippedCollectionValue] = useState<number | null>(null);
  const [sealedCollectionValue, setSealedCollectionValue] = useState<number | null>(null);
  const [collectionValueLoading, setCollectionValueLoading] = useState(true);

  useEffect(() => {
    fetch("/api/transactions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { docs?: TransactionDoc[] } | null) => {
        if (data?.docs) setDocs(data.docs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/collection-value")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: {
          totalValue?: number;
          singleCardsValueGbp?: number;
          gradedCardsValueGbp?: number;
          rippedValueGbp?: number;
          sealedValueGbp?: number;
        } | null) => {
          if (data?.totalValue !== undefined) setCollectionValue(data.totalValue);
          if (data?.singleCardsValueGbp !== undefined) setSingleCardsCollectionValue(data.singleCardsValueGbp);
          if (data?.gradedCardsValueGbp !== undefined) setGradedCardsCollectionValue(data.gradedCardsValueGbp);
          if (data?.rippedValueGbp !== undefined) setRippedCollectionValue(data.rippedValueGbp);
          if (data?.sealedValueGbp !== undefined) setSealedCollectionValue(data.sealedValueGbp);
        },
      )
      .catch(() => {})
      .finally(() => setCollectionValueLoading(false));
  }, []);

  useEffect(() => {
    if (prefillApplied) return;
    const next = buildPrefillForm(searchParams);
    if (!next) return;
    setNewForm(next);
    setShowNew(true);
    setEditingId(null);
    setPrefillApplied(true);
  }, [prefillApplied, searchParams]);

  // ── Filtered docs + summary ────────────────────────────────────────────────

  const filtered = useMemo(
    () =>
      filterByPeriod(docs, period).slice().sort(
        (a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime(),
      ),
    [docs, period],
  );

  const totalSpent = useMemo(
    () =>
      filtered
        .filter((d) => d.direction === "purchase")
        .reduce((s, d) => s + d.unitPrice * d.quantity, 0),
    [filtered],
  );

  const totalSold = useMemo(
    () =>
      filtered
        .filter((d) => d.direction === "sale")
        .reduce((s, d) => s + d.unitPrice * d.quantity, 0),
    [filtered],
  );

  const spentByCategory = useMemo(() => {
    let single = 0;
    let graded = 0;
    let sealed = 0;
    let ripped = 0;
    for (const d of filtered) {
      if (d.direction !== "purchase") continue;
      const line = d.unitPrice * d.quantity;
      const cat = transactionFourWayCategory(d);
      if (cat === "graded") graded += line;
      else if (cat === "sealed") sealed += line;
      else if (cat === "ripped") ripped += line;
      else single += line;
    }
    return { single, graded, sealed, ripped };
  }, [filtered]);

  const soldByCategory = useMemo(() => {
    let single = 0;
    let graded = 0;
    let sealed = 0;
    let ripped = 0;
    for (const d of filtered) {
      if (d.direction !== "sale") continue;
      const line = d.unitPrice * d.quantity;
      const cat = transactionFourWayCategory(d);
      if (cat === "graded") graded += line;
      else if (cat === "sealed") sealed += line;
      else if (cat === "ripped") ripped += line;
      else single += line;
    }
    return { single, graded, sealed, ripped };
  }, [filtered]);

  // P&L = (sold proceeds + current collection value) - total spent
  const netPnl = totalSold + (collectionValue ?? 0) - totalSpent;

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    setNewPending(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: newForm.direction,
          ...(newForm.productTypeId.trim() ? { productTypeId: newForm.productTypeId } : {}),
          description: newForm.description,
          quantity: parseInt(newForm.quantity, 10) || 1,
          unitPrice: parseFloat(newForm.unitPrice) || 0,
          transactionDate: newForm.transactionDate
            ? new Date(newForm.transactionDate).toISOString()
            : new Date().toISOString(),
          notes: newForm.notes || null,
          sourceReference: newForm.sourceReference || null,
          sealedState:
            newForm.sealedState === "sealed" || newForm.sealedState === "opened"
              ? newForm.sealedState
              : null,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { doc?: TransactionDoc };
      if (data.doc) {
        setDocs((prev) => [data.doc!, ...prev]);
        setNewForm(blankForm());
        setShowNew(false);
      }
    } catch {
      /* network error */
    } finally {
      setNewPending(false);
    }
  }, [newForm]);

  // ── Edit ───────────────────────────────────────────────────────────────────

  const startEdit = useCallback((doc: TransactionDoc) => {
    setEditingId(String(doc.id));
    setEditForm(formFromDoc(doc));
    setDeletingId(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return;
    setEditPending(true);
    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: editForm.direction,
          ...(editForm.productTypeId.trim()
            ? { productTypeId: editForm.productTypeId }
            : { productTypeId: null }),
          description: editForm.description,
          quantity: parseInt(editForm.quantity, 10) || 1,
          unitPrice: parseFloat(editForm.unitPrice) || 0,
          transactionDate: editForm.transactionDate
            ? new Date(editForm.transactionDate).toISOString()
            : new Date().toISOString(),
          notes: editForm.notes || null,
          sourceReference: editForm.sourceReference || null,
          sealedState:
            editForm.sealedState === "sealed" || editForm.sealedState === "opened"
              ? editForm.sealedState
              : null,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { doc?: TransactionDoc };
      if (data.doc) {
        setDocs((prev) => prev.map((d) => (String(d.id) === editingId ? data.doc! : d)));
        setEditingId(null);
      }
    } catch {
      /* network error */
    } finally {
      setEditPending(false);
    }
  }, [editingId, editForm]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: string) => {
    setDeletePending(true);
    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => String(d.id) !== id));
        setDeletingId(null);
      }
    } catch {
      /* network error */
    } finally {
      setDeletePending(false);
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-full min-w-0 w-full flex-col px-4 pb-[var(--bottom-nav-offset)] pt-[var(--mobile-page-top-offset)] text-[var(--foreground)]">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold tracking-tight">Transactions</h1>
        <button
          type="button"
          onClick={() => {
            setShowNew(true);
            setNewForm(blankForm());
            setEditingId(null);
          }}
          className="rounded-full border border-[var(--foreground)]/22 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/16"
        >
          + New
        </button>
      </div>

      {/* Period filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        {(["all", "year", "month"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              period === p
                ? "border-[var(--foreground)]/45 bg-[var(--foreground)] text-[var(--background)] shadow-sm"
                : "border-[var(--foreground)]/18 bg-[var(--foreground)]/[0.06] text-[var(--foreground)]/72 hover:bg-[var(--foreground)]/12"
            }`}
          >
            {p === "all" ? "All time" : p === "year" ? "This year" : "This month"}
          </button>
        ))}
      </div>

      {/* Summary totals + category breakdown */}
      <div className="mb-6 flex min-w-0 flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col rounded-2xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/[0.045] p-4 shadow-[0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]/48">
              Spent
            </span>
            <span className="mt-2 text-lg font-bold tabular-nums leading-none text-red-400">{fmt(totalSpent)}</span>
          </div>
          <div className="flex flex-col rounded-2xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/[0.045] p-4 shadow-[0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]/48">
              Sold
            </span>
            <span className="mt-2 text-lg font-bold tabular-nums leading-none text-green-400">{fmt(totalSold)}</span>
          </div>
          <div className="flex flex-col rounded-2xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/[0.045] p-4 shadow-[0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]/48">
              Collection
            </span>
            <span className="mt-2 text-lg font-bold tabular-nums leading-none text-[var(--foreground)]/90">
              {collectionValueLoading ? "…" : fmt(collectionValue ?? 0)}
            </span>
          </div>
          <div className="flex flex-col rounded-2xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/[0.045] p-4 shadow-[0_1px_0_color-mix(in_srgb,var(--foreground)_8%,transparent)]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]/48">
              P&amp;L
            </span>
            <span
              className={`mt-2 text-lg font-bold tabular-nums leading-none ${
                netPnl >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {collectionValueLoading ? "…" : `${netPnl >= 0 ? "+" : ""}${fmt(netPnl)}`}
            </span>
            <span className="mt-1.5 text-[10px] leading-tight text-[var(--foreground)]/38">Sold + collection − spent</span>
          </div>
        </div>

        <div className="txn-breakdown w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/[0.035] p-1 shadow-[0_1px_0_color-mix(in_srgb,var(--foreground)_6%,transparent)]">
          <table className="txn-breakdown__table w-full min-w-[18rem] border-collapse text-left text-[11px] sm:min-w-[24rem] sm:text-[13px]">
            <thead>
              <tr className="border-b border-[var(--foreground)]/10">
                <th className="txn-breakdown__th px-1.5 py-2 font-semibold text-[var(--foreground)]/55 sm:px-3 sm:py-2.5">
                  Category
                </th>
                <th className="txn-breakdown__th px-1.5 py-2 text-right font-semibold text-[var(--foreground)]/55 sm:px-3 sm:py-2.5">
                  <span className="sm:hidden">Coll.</span>
                  <span className="hidden sm:inline">Collection</span>
                </th>
                <th className="txn-breakdown__th px-1.5 py-2 text-right font-semibold text-[var(--foreground)]/55 sm:px-3 sm:py-2.5">
                  Spent
                </th>
                <th className="txn-breakdown__th px-1.5 py-2 text-right font-semibold text-[var(--foreground)]/55 sm:px-3 sm:py-2.5">
                  Sold
                </th>
                <th className="txn-breakdown__th px-1.5 py-2 text-right font-semibold text-[var(--foreground)]/55 sm:px-3 sm:py-2.5">
                  P&amp;L
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Single cards", "single"] as const,
                  ["Graded cards", "graded"] as const,
                  ["Sealed product", "sealed"] as const,
                  ["Ripped (packed & opened)", "ripped"] as const,
                ] as const
              ).map(([label, key]) => {
                const collectionAmt = collectionValueLoading
                  ? 0
                  : key === "single"
                    ? (singleCardsCollectionValue ?? 0)
                    : key === "graded"
                      ? (gradedCardsCollectionValue ?? 0)
                      : key === "sealed"
                        ? (sealedCollectionValue ?? 0)
                        : (rippedCollectionValue ?? 0);
                const spentAmt =
                  key === "single"
                    ? spentByCategory.single
                    : key === "graded"
                      ? spentByCategory.graded
                      : key === "sealed"
                        ? spentByCategory.sealed
                        : spentByCategory.ripped;
                const soldAmt =
                  key === "single"
                    ? soldByCategory.single
                    : key === "graded"
                      ? soldByCategory.graded
                      : key === "sealed"
                        ? soldByCategory.sealed
                        : soldByCategory.ripped;
                const rowPnl = collectionAmt + soldAmt - spentAmt;
                return (
                  <tr key={key} className="border-b border-[var(--foreground)]/8 last:border-b-0">
                    <td className="txn-breakdown__td max-w-[7.25rem] break-words px-1.5 py-2 font-medium leading-snug text-[var(--foreground)]/88 sm:max-w-none sm:px-3 sm:py-2.5 sm:leading-normal">
                      {label}
                    </td>
                    <td className="txn-breakdown__td whitespace-nowrap px-1.5 py-2 text-right tabular-nums text-[var(--foreground)]/90 sm:px-3 sm:py-2.5">
                      {collectionValueLoading ? "…" : fmt(collectionAmt)}
                    </td>
                    <td className="txn-breakdown__td whitespace-nowrap px-1.5 py-2 text-right tabular-nums text-red-400/95 sm:px-3 sm:py-2.5">
                      {fmt(spentAmt)}
                    </td>
                    <td className="txn-breakdown__td whitespace-nowrap px-1.5 py-2 text-right tabular-nums text-green-400/95 sm:px-3 sm:py-2.5">
                      {fmt(soldAmt)}
                    </td>
                    <td
                      className={`txn-breakdown__td whitespace-nowrap px-1.5 py-2 text-right text-xs font-semibold tabular-nums sm:px-3 sm:py-2.5 sm:text-sm ${
                        collectionValueLoading
                          ? "text-[var(--foreground)]/50"
                          : rowPnl >= 0
                            ? "text-green-400"
                            : "text-red-400"
                      }`}
                    >
                      {collectionValueLoading ? "…" : `${rowPnl >= 0 ? "+" : ""}${fmt(rowPnl)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-[var(--foreground)]/8 px-3 py-2 text-[10px] leading-snug text-[var(--foreground)]/42">
            Ripped collection value is cards marked as pulled from packs. Spent and sold for Ripped include transactions
            with <span className="font-semibold text-[var(--foreground)]/55">Opened</span> sealed product.
          </p>
        </div>
      </div>

      {/* New transaction form */}
      {showNew && (
        <div className="mb-6 rounded-2xl border border-[var(--foreground)]/14 bg-[var(--foreground)]/[0.05] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_6%,transparent)]">
          <h2 className="mb-3 text-sm font-semibold tracking-tight">New transaction</h2>
          <TransactionForm
            form={newForm}
            setForm={setNewForm}
            productTypes={productTypes}
            onSubmit={() => void handleCreate()}
            onCancel={() => setShowNew(false)}
            pending={newPending}
            submitLabel="Add"
          />
        </div>
      )}

      {/* Transaction list */}
      {loading ? (
        <p className="py-12 text-center text-sm text-[var(--foreground)]/50">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--foreground)]/50">
          No transactions yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((doc) => {
            const id = String(doc.id);
            const total = doc.unitPrice * doc.quantity;
            const isEditing = editingId === id;
            const isDeleting = deletingId === id;
            const directionLabel = doc.direction === "sale" ? "Sale" : "Purchase";
            const spendCat = transactionFourWayCategory(doc);

            return (
              <li
                key={id}
                className="overflow-hidden rounded-2xl border border-[var(--foreground)]/12 bg-[var(--foreground)]/[0.04] shadow-[0_1px_0_color-mix(in_srgb,var(--foreground)_6%,transparent)]"
              >
                {isEditing ? (
                  <div className="p-4">
                    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]/45">
                      Edit transaction
                    </h3>
                    <TransactionForm
                      form={editForm}
                      setForm={setEditForm}
                      productTypes={productTypes}
                      onSubmit={() => void handleSaveEdit()}
                      onCancel={() => setEditingId(null)}
                      pending={editPending}
                      submitLabel="Save"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <div className="flex gap-3 p-4 pb-3">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`txn-direction ${
                              doc.direction === "sale" ? "txn-direction--sale" : "txn-direction--purchase"
                            }`}
                          >
                            {directionLabel}
                          </span>
                          <span
                            className="rounded-full border border-[var(--foreground)]/14 bg-[var(--foreground)]/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)]/58"
                            title="Transaction category"
                          >
                            {fourWayTxnChipLabel(spendCat)}
                          </span>
                          <span className={productTypeChipClass(doc.productType)} title="Product type">
                            {productTypeName(doc.productType)}
                          </span>
                          {doc.sealedState === "sealed" || doc.sealedState === "opened" ? (
                            <span
                              className="rounded-full border border-[var(--foreground)]/18 bg-[var(--foreground)]/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)]/65"
                              title="Sealed product state"
                            >
                              {doc.sealedState === "sealed" ? "Sealed" : "Opened"}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[15px] font-semibold leading-snug tracking-tight text-[var(--foreground)]">
                          {doc.description}
                        </p>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-[var(--foreground)]/65">
                          {doc.quantity > 1 ? (
                            <>
                              <span className="tabular-nums">
                                <span className="text-[var(--foreground)]/40">Qty</span> {doc.quantity}
                              </span>
                              <span className="text-[var(--foreground)]/25" aria-hidden>
                                ·
                              </span>
                              <span className="tabular-nums">
                                <span className="text-[var(--foreground)]/40">Each</span> {fmt(doc.unitPrice)}
                              </span>
                              <span className="text-[var(--foreground)]/25" aria-hidden>
                                ·
                              </span>
                              <span className="font-medium tabular-nums text-[var(--foreground)]/85">
                                Total {fmt(total)}
                              </span>
                            </>
                          ) : (
                            <span className="tabular-nums">
                              <span className="text-[var(--foreground)]/40">Price</span>{" "}
                              <span className="font-medium text-[var(--foreground)]/88">{fmt(doc.unitPrice)}</span>
                            </span>
                          )}
                        </div>
                        {doc.notes ? (
                          <p className="text-xs italic leading-relaxed text-[var(--foreground)]/48">{doc.notes}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-start pt-0.5">
                        <span
                          className={`text-lg font-bold tabular-nums leading-none ${
                            doc.direction === "sale" ? "text-green-400" : "text-[var(--foreground)]/88"
                          }`}
                        >
                          {doc.direction === "sale" ? "+" : "−"}
                          {fmt(total)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-[var(--foreground)]/10 bg-[var(--foreground)]/[0.03] px-4 py-3">
                      <time
                        className="text-xs font-medium text-[var(--foreground)]/45"
                        dateTime={doc.transactionDate}
                      >
                        {fmtDate(doc.transactionDate)}
                      </time>
                      {isDeleting ? (
                        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                          <span className="text-xs text-[var(--foreground)]/55">Delete?</span>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            className="rounded-full border border-[var(--foreground)]/20 px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--foreground)]/10"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={deletePending}
                            onClick={() => void handleDelete(id)}
                            className="rounded-full border border-red-400/45 bg-red-500/12 px-3 py-1.5 text-xs font-semibold text-red-400 disabled:opacity-50"
                          >
                            {deletePending ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(doc)}
                            className="rounded-full border border-[var(--foreground)]/18 bg-[var(--foreground)]/8 px-3.5 py-1.5 text-xs font-semibold transition hover:bg-[var(--foreground)]/14"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingId(id);
                              setEditingId(null);
                            }}
                            className="rounded-full border border-red-400/35 bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/16"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
