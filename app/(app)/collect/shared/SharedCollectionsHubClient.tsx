"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { CustomerProfileShareStatus } from "@/lib/customerProfileShares";
import { displayCustomerName } from "@/lib/customerProfileShares";
import type { OutgoingShareListItem, IncomingShareListItem } from "@/lib/customerProfileSharesServer";
import { TRADE_NOTIFICATIONS_UPDATED_EVENT } from "@/lib/tradeNotificationsConstants";
import type { TradeNotificationListItem } from "@/lib/tradeNotificationsServer";

function outgoingPendingLabel(status: CustomerProfileShareStatus): string {
  switch (status) {
    case "pending_recipient":
      return "Waiting for them to sign up";
    case "pending_accept":
      return "Waiting for them to accept";
    default:
      return status;
  }
}

function formatTradeNotificationTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

type Props = {
  outgoing: OutgoingShareListItem[];
  incoming: IncomingShareListItem[];
  initialTradeNotifications: TradeNotificationListItem[];
};

export function SharedCollectionsHubClient({
  outgoing: initialOutgoing,
  incoming: initialIncoming,
  initialTradeNotifications,
}: Props) {
  const router = useRouter();
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [tradeNotifs, setTradeNotifs] = useState<TradeNotificationListItem[]>(initialTradeNotifications);
  const [localOutgoing, setLocalOutgoing] = useState<OutgoingShareListItem[] | null>(null);
  const [localIncoming, setLocalIncoming] = useState<IncomingShareListItem[] | null>(null);
  const outgoing = localOutgoing ?? initialOutgoing;
  const incoming = localIncoming ?? initialIncoming;

  useEffect(() => {
    setLocalOutgoing(null);
    setLocalIncoming(null);
  }, [initialIncoming, initialOutgoing]);

  useEffect(() => {
    setTradeNotifs(initialTradeNotifications);
  }, [initialTradeNotifications]);

  const refresh = async () => {
    const r = await fetch("/api/profile-shares");
    if (!r.ok) return;
    const j = (await r.json()) as { outgoing?: OutgoingShareListItem[]; incoming?: IncomingShareListItem[] };
    setLocalOutgoing(j.outgoing ?? outgoing);
    setLocalIncoming(j.incoming ?? incoming);
  };

  const openTradeNotification = useCallback(
    async (n: TradeNotificationListItem) => {
      const res = await fetch(`/api/trade-notifications/${encodeURIComponent(n.id)}`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) return;
      setTradeNotifs((prev) => prev.filter((x) => x.id !== n.id));
      window.dispatchEvent(new Event(TRADE_NOTIFICATIONS_UPDATED_EVENT));
      if (n.shareId && n.tradeId) {
        router.push(
          `/collect/shared/${encodeURIComponent(n.shareId)}/trade/${encodeURIComponent(n.tradeId)}`,
        );
      } else {
        router.push("/collect/shared");
      }
      router.refresh();
    },
    [router],
  );

  const closeShareSheet = () => {
    setShareSheetOpen(false);
    setInviteError(null);
  };

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

  const {
    pendingOutgoing,
    pendingIncoming,
    activeOutgoing,
    activeIncoming,
  } = useMemo(() => {
    const nextPendingOutgoing: OutgoingShareListItem[] = [];
    const nextPendingIncoming: IncomingShareListItem[] = [];
    const nextActiveOutgoing: OutgoingShareListItem[] = [];
    const nextActiveIncoming: IncomingShareListItem[] = [];

    for (const row of outgoing) {
      if (row.status === "active") nextActiveOutgoing.push(row);
      else if (row.status === "pending_recipient" || row.status === "pending_accept") nextPendingOutgoing.push(row);
    }

    for (const row of incoming) {
      if (row.status === "active") nextActiveIncoming.push(row);
      else if (row.status === "pending_accept") nextPendingIncoming.push(row);
    }

    return {
      pendingOutgoing: nextPendingOutgoing,
      pendingIncoming: nextPendingIncoming,
      activeOutgoing: nextActiveOutgoing,
      activeIncoming: nextActiveIncoming,
    };
  }, [incoming, outgoing]);
  const hasPending = pendingOutgoing.length > 0 || pendingIncoming.length > 0;
  const hasActiveOutgoing = activeOutgoing.length > 0;
  const hasActiveIncoming = activeIncoming.length > 0;
  const hasActive = hasActiveOutgoing || hasActiveIncoming;
  const hasUnreadTradeNotifs = tradeNotifs.length > 0;
  const showMainStack = hasPending || hasActive || hasUnreadTradeNotifs;

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-[var(--bottom-nav-offset)] pt-2 text-[var(--foreground)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Shared collections</h1>
        <button
          type="button"
          onClick={() => {
            setInviteError(null);
            setShareSheetOpen(true);
          }}
          className="inline-flex items-center justify-center rounded-full border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-center text-sm font-medium leading-none transition hover:bg-[var(--foreground)]/18"
          aria-haspopup="dialog"
          aria-expanded={shareSheetOpen}
          aria-controls="shared-collections-invite-sheet"
        >
          Share
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      {showMainStack ? (
        <div className="mt-8 flex flex-col gap-8">
          {hasPending ? (
            <section>
              <h2 className="text-base font-semibold">Pending invites</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {pendingOutgoing.map((row) => (
                  <li
                    key={`out-${row.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">You invited</p>
                      <p className="truncate text-sm font-medium">{row.recipientEmail}</p>
                      <p className="text-xs text-[var(--foreground)]/55">{outgoingPendingLabel(row.status)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void revoke(row.id)}
                      className="shrink-0 text-xs font-medium text-red-400/90 transition hover:text-red-300"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
                {pendingIncoming.map((row) => (
                  <li
                    key={`in-${row.id}`}
                    className="flex flex-col gap-2 rounded-lg border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">Shared with you</p>
                      <p className="text-sm font-medium">{displayCustomerName(row.owner)}</p>
                      <p className="truncate text-xs text-[var(--foreground)]/55">{row.owner.email}</p>
                      <p className="mt-1 text-xs text-[var(--foreground)]/50">Waiting for you to accept</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {hasUnreadTradeNotifs ? (
            <section aria-label="Unread trade notifications">
              <h2 className="text-base font-semibold">Notifications</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {tradeNotifs.map((n) => {
                  const timeLabel = formatTradeNotificationTime(n.createdAt);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void openTradeNotification(n)}
                        className="flex w-full cursor-pointer touch-manipulation items-center justify-between gap-4 rounded-full border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-5 py-3 text-left transition hover:bg-[var(--foreground)]/10 active:bg-[var(--foreground)]/12"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-3 text-sm font-medium">{n.body}</span>
                          {timeLabel ? (
                            <span className="mt-1 block text-xs text-[var(--foreground)]/50">{timeLabel}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 pr-1 text-lg leading-none text-[var(--foreground)]/45" aria-hidden>
                          ›
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {hasActiveIncoming ? (
            <section>
              <h2 className="text-base font-semibold">Friends</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {activeIncoming.map((row) => {
                  const friendName = displayCustomerName(row.owner);
                  return (
                    <li key={`friend-in-${row.id}`}>
                      <Link
                        href={`/collect/shared/${row.id}`}
                        aria-label={`View ${friendName}'s shared collection`}
                        className="flex w-full cursor-pointer touch-manipulation items-center rounded-full border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 py-3 transition hover:bg-[var(--foreground)]/10 active:bg-[var(--foreground)]/12"
                      >
                        <span
                          className="flex w-full items-center justify-between"
                          style={{ paddingLeft: "2rem", paddingRight: "2rem" }}
                        >
                          <span className="min-w-0 truncate text-sm font-medium leading-none">{friendName}</span>
                          <span className="shrink-0 text-lg leading-none text-[var(--foreground)]/45" aria-hidden>
                            ›
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

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
                aria-label="Share"
              >
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--foreground)]/18" />
                <h2 className="text-lg font-semibold">Share your collection</h2>
                <p className="mt-1 text-sm text-[var(--foreground)]/65">
                  Enter their email. They can accept and see your collection and wishlist.
                </p>

                {hasActiveOutgoing ? (
                  <section className="mt-4">
                    <h3 className="text-sm font-semibold">
                      {`Shared with ${activeOutgoing.length} ${activeOutgoing.length === 1 ? "person" : "people"}`}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--foreground)]/65">
                      They can see your collection and wishlist. Revoke to remove access.
                    </p>
                    <ul className="mt-3 flex flex-col gap-2">
                      {activeOutgoing.map((row) => (
                        <li
                          key={`sheet-active-out-${row.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--foreground)]/12 bg-[var(--foreground)]/5 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]/50">You invited</p>
                            <p className="truncate text-sm font-medium">{row.recipientEmail}</p>
                            <p className="text-xs text-[var(--foreground)]/55">Active</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void revoke(row.id)}
                            className="shrink-0 text-xs font-medium text-red-400/90 transition hover:text-red-300"
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

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
    </div>
  );
}

export default SharedCollectionsHubClient;
