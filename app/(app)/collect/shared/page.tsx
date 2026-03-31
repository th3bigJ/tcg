import Link from "next/link";

import { SharedCollectionsHubClient } from "@/app/(app)/collect/shared/SharedCollectionsHubClient";
import { getCurrentCustomer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listIncomingProfileShares, listOutgoingProfileShares } from "@/lib/customerProfileSharesServer";
import { listUnreadTradeNotifications } from "@/lib/tradeNotificationsServer";

export default async function SharedCollectionsPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-6 pt-2 text-[var(--foreground)]">
        <h1 className="text-xl font-semibold">Shared collections</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">Sign in to share your collection or view shares.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-fit rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const [outgoing, incoming, initialTradeNotifications] = await Promise.all([
    listOutgoingProfileShares(customer.id),
    listIncomingProfileShares(customer.id),
    (async () => {
      const supabase = await createSupabaseServerClient();
      return listUnreadTradeNotifications(supabase);
    })(),
  ]);

  return (
    <SharedCollectionsHubClient
      outgoing={outgoing}
      incoming={incoming}
      initialTradeNotifications={initialTradeNotifications}
    />
  );
}
