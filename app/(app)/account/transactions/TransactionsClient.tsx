"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  };
}

function formFromDoc(doc: TransactionDoc): FormState {
  return {
    direction: doc.direction,
    productTypeId: productTypeId(doc.productType),
    description: doc.description,
    quantity: String(doc.quantity),
    unitPrice: String(doc.unitPrice),
    transactionDate: doc.transactionDate ? doc.transactionDate.slice(0, 10) : todayIso(),
    notes: doc.notes ?? "",
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
        <span className="font-medium">Product type</span>
        <select
          value={form.productTypeId}
          onChange={(e) => setForm({ ...form, productTypeId: e.target.value })}
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
          disabled={pending || !form.description.trim() || !form.productTypeId}
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

  // ── Load transactions + collection value ──────────────────────────────────

  const [collectionValue, setCollectionValue] = useState<number | null>(null);
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
      .then((data: { totalValue?: number } | null) => {
        if (data?.totalValue !== undefined) setCollectionValue(data.totalValue);
      })
      .catch(() => {})
      .finally(() => setCollectionValueLoading(false));
  }, []);

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
          productTypeId: newForm.productTypeId,
          description: newForm.description,
          quantity: parseInt(newForm.quantity, 10) || 1,
          unitPrice: parseFloat(newForm.unitPrice) || 0,
          transactionDate: newForm.transactionDate
            ? new Date(newForm.transactionDate).toISOString()
            : new Date().toISOString(),
          notes: newForm.notes || null,
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
          productTypeId: editForm.productTypeId,
          description: editForm.description,
          quantity: parseInt(editForm.quantity, 10) || 1,
          unitPrice: parseFloat(editForm.unitPrice) || 0,
          transactionDate: editForm.transactionDate
            ? new Date(editForm.transactionDate).toISOString()
            : new Date().toISOString(),
          notes: editForm.notes || null,
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
    <div className="flex min-h-full flex-col px-4 pb-6 pt-2">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold">Transactions</h1>
        <button
          type="button"
          onClick={() => {
            setShowNew(true);
            setNewForm(blankForm());
            setEditingId(null);
          }}
          className="rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
        >
          + New
        </button>
      </div>

      {/* Period filter */}
      <div className="mb-4 flex gap-2">
        {(["all", "year", "month"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              period === p
                ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/14"
            }`}
          >
            {p === "all" ? "All time" : p === "year" ? "This year" : "This month"}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-2">
        <div className="flex flex-col rounded-xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--foreground)]/50">Spent</span>
          <span className="mt-1 text-sm font-semibold tabular-nums text-red-400">{fmt(totalSpent)}</span>
        </div>
        <div className="flex flex-col rounded-xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--foreground)]/50">Sold</span>
          <span className="mt-1 text-sm font-semibold tabular-nums text-green-400">{fmt(totalSold)}</span>
        </div>
        <div className="flex flex-col rounded-xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--foreground)]/50">Collection value</span>
          <span className="mt-1 text-sm font-semibold tabular-nums text-[var(--foreground)]/80">
            {collectionValueLoading ? "…" : fmt(collectionValue ?? 0)}
          </span>
        </div>
        <div className="flex flex-col rounded-xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--foreground)]/50">P&amp;L</span>
          <span
            className={`mt-1 text-sm font-semibold tabular-nums ${
              netPnl >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {collectionValueLoading ? "…" : `${netPnl >= 0 ? "+" : ""}${fmt(netPnl)}`}
          </span>
          <span className="mt-0.5 text-[9px] text-[var(--foreground)]/35">sold + collection − spent</span>
        </div>
      </div>

      {/* New transaction form */}
      {showNew && (
        <div className="mb-6 rounded-xl border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-4">
          <h2 className="mb-3 text-sm font-semibold">New transaction</h2>
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
        <p className="py-8 text-center text-sm text-[var(--foreground)]/50">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--foreground)]/50">
          No transactions yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((doc) => {
            const id = String(doc.id);
            const total = doc.unitPrice * doc.quantity;
            const isEditing = editingId === id;
            const isDeleting = deletingId === id;

            return (
              <li
                key={id}
                className="rounded-xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-3"
              >
                {isEditing ? (
                  <>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/50">
                      Editing
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
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      {/* Direction badge */}
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          doc.direction === "sale"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-blue-500/15 text-blue-400"
                        }`}
                      >
                        {doc.direction}
                      </span>

                      {/* Main info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{doc.description}</p>
                        <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
                          {productTypeName(doc.productType)}
                          {" · "}
                          {doc.quantity > 1 ? `${doc.quantity} × ` : ""}
                          {fmt(doc.unitPrice)}
                          {doc.quantity > 1 ? ` = ${fmt(total)}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--foreground)]/40">
                          {fmtDate(doc.transactionDate)}
                        </p>
                        {doc.notes ? (
                          <p className="mt-1 text-xs italic text-[var(--foreground)]/45">
                            {doc.notes}
                          </p>
                        ) : null}
                      </div>

                      {/* Total */}
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          doc.direction === "sale" ? "text-green-400" : "text-[var(--foreground)]/80"
                        }`}
                      >
                        {doc.direction === "sale" ? "+" : "−"}
                        {fmt(total)}
                      </span>
                    </div>

                    {/* Actions */}
                    {isDeleting ? (
                      <div className="mt-3 flex items-center gap-2 border-t border-[var(--foreground)]/10 pt-3">
                        <span className="flex-1 text-xs text-[var(--foreground)]/60">
                          Delete this transaction?
                        </span>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="rounded-md border border-[var(--foreground)]/20 px-3 py-1 text-xs font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={deletePending}
                          onClick={() => void handleDelete(id)}
                          className="rounded-md border border-red-400/50 bg-red-500/15 px-3 py-1 text-xs font-medium text-red-400 disabled:opacity-50"
                        >
                          {deletePending ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2.5 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(doc)}
                          className="rounded-md border border-[var(--foreground)]/18 bg-[var(--foreground)]/6 px-3 py-1 text-xs font-medium transition hover:bg-[var(--foreground)]/12"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingId(id);
                            setEditingId(null);
                          }}
                          className="rounded-md border border-red-400/30 bg-red-500/8 px-3 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/15"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
