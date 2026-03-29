"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";

import type { CustomerProfileShareStatus } from "@/lib/customerProfileShares";
import { displayCustomerName } from "@/lib/customerProfileShares";
import type { OutgoingShareListItem, IncomingShareListItem } from "@/lib/customerProfileSharesServer";

function statusLabel(status: CustomerProfileShareStatus): string {
  switch (status) {
    case "pending_recipient":
      return "Waiting for them to sign up";
    case "pending_accept":
      return "Waiting for them to accept";
    case "active":
      return "Active";
    case "declined":
      return "Declined";
    case "revoked":
      return "Revoked";
    default:
      return status;
  }
}

type Props = {
  outgoing: OutgoingShareListItem[];
  incoming: IncomingShareListItem[];
};

export function SharedCollectionsHubClient({ outgoing: initialOutgoing, incoming: initialIncoming }: Props) {
  const router = useRouter();
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [outgoing, setOutgoing] = useState(initialOutgoing);
  const [incoming, setIncoming] = useState(initialIncoming);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/profile-shares");
    if (!r.ok) return;
    const j = (await r.json()) as { outgoing?: OutgoingShareListItem[]; incoming?: IncomingShareListItem[] };
    if (j.outgoing) setOutgoing(j.outgoing);
    if (j.incoming) setIncoming(j.incoming);
  }, []);

  const closeShareSheet = useCallback(() => {
    setShareSheetOpen(false);
    setInviteError(null);
  }, []);

  const onSubmitShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setPending(true);
    try {
      const r = await fetch("/api/profile-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: email }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setInviteError(j.error ?? "Could not send invite.");
        return;
      }
      setEmail("");
      closeShareSheet();
      await refresh();
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const accept = async (id: string) => {
    const r = await fetch(`/api/profile-shares/${encodeURIComponent(id)}/accept`, { method: "POST" });
    if (!r.ok) {
      const j = (await r.json()) as { error?: string };
      setError(j.error ?? "Could not accept.");
      return;
    }
    await refresh();
    router.refresh();
  };

  const decline = async (id: string) => {
    const r = await fetch(`/api/profile-shares/${encodeURIComponent(id)}/decline`, { method: "POST" });
    if (!r.ok) {
      const j = (await r.json()) as { error?: string };
      setError(j.error ?? "Could not decline.");
      return;
    }
    await refresh();
    router.refresh();
  };

  const revoke = async (id: string) => {
    const r = await fetch(`/api/profile-shares/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!r.ok) {
      const j = (await r.json()) as { error?: string };
      setError(j.error ?? "Could not revoke.");
      return;
    }
    await refresh();
    router.refresh();
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-8 pt-[var(--mobile-page-top-offset)] text-[var(--foreground)]">
      <div className="mb-6">
        <Link
          href="/collect"
          className="text-sm font-medium text-[var(--foreground)]/65 transition hover:text-[var(--foreground)]"
        >
          ← Back to collection
        </Link>
      </div>
      <h1 className="text-xl font-semibold">Shared collections</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/65">
        Invite someone by email. They must accept before they can see your collection and wishlist.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Share yours</h2>
          <button
            type="button"
            onClick={() => {
              setInviteError(null);
              setShareSheetOpen(true);
            }}
            className="rounded-lg border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
            aria-haspopup="dialog"
            aria-expanded={shareSheetOpen}
            aria-controls="shared-collections-invite-sheet"
          >
            Invite someone
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {outgoing.length === 0 ? (
            <li className="rounded-lg border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-3 py-3 text-sm text-[var(--foreground)]/60">
              No invites yet.
            </li>
          ) : (
            outgoing.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.recipientEmail}</p>
                  <p className="text-xs text-[var(--foreground)]/55">{statusLabel(row.status)}</p>
                </div>
                {row.status !== "revoked" && row.status !== "declined" ? (
                  <button
                    type="button"
                    onClick={() => void revoke(row.id)}
                    className="shrink-0 text-xs font-medium text-red-400/90 transition hover:text-red-300"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>

      {shareSheetOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[10001] flex flex-col justify-end bg-black/60"
              onClick={closeShareSheet}
              role="presentation"
            >
              <div
                id="shared-collections-invite-sheet"
                className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-[var(--foreground)]/15 bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] text-[var(--foreground)] shadow-xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Invite someone to view your collection"
              >
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--foreground)]/18" />
                <h2 className="text-lg font-semibold">Share your collection</h2>
                <p className="mt-1 text-sm text-[var(--foreground)]/65">
                  Enter their email. They can accept and see your collection and wishlist.
                </p>

                {inviteError ? (
                  <p
                    className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                    role="alert"
                  >
                    {inviteError}
                  </p>
                ) : null}

                <form onSubmit={onSubmitShare} className="mt-4 flex flex-col gap-4">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-[var(--foreground)]/80">Recipient email</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="friend@example.com"
                      className="rounded-lg border border-[var(--foreground)]/20 bg-[var(--background)] px-3 py-2 text-[var(--foreground)]"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={pending}
                    className="w-full rounded-lg border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--foreground)]/18 disabled:opacity-50"
                  >
                    {pending ? "Sending…" : "Send invite"}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={closeShareSheet}
                  className="mt-3 w-full rounded-md border border-[var(--foreground)]/25 px-4 py-2 text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      <section className="mt-10">
        <h2 className="text-base font-semibold">Shared with you</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {incoming.length === 0 ? (
            <li className="rounded-lg border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-3 py-3 text-sm text-[var(--foreground)]/60">
              Nothing here yet.
            </li>
          ) : (
            incoming.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-lg border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{displayCustomerName(row.owner)}</p>
                  <p className="truncate text-xs text-[var(--foreground)]/55">{row.owner.email}</p>
                  <p className="mt-1 text-xs text-[var(--foreground)]/50">{statusLabel(row.status)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.status === "pending_accept" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void accept(row.id)}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-100"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => void decline(row.id)}
                        className="rounded-lg border border-[var(--foreground)]/20 px-3 py-1.5 text-xs font-medium text-[var(--foreground)]/75"
                      >
                        Decline
                      </button>
                    </>
                  ) : null}
                  {row.status === "active" ? (
                    <Link
                      href={`/collect/shared/${row.id}`}
                      className="inline-flex rounded-lg border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--foreground)]/18"
                    >
                      View
                    </Link>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
