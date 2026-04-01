import { DevRuntimeGuards } from "@/app/(app)/DevRuntimeGuards";
import { BottomNav } from "@/components/BottomNav";
import { CardGridPreferencesProvider } from "@/components/CardGridPreferencesProvider";
import { PullToRefresh } from "@/components/PullToRefresh";
import { UniversalSearch } from "@/components/UniversalSearch";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchCustomerGridPreferences } from "@/lib/customerPreferencesServer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countUnreadTradeNotifications } from "@/lib/tradeNotificationsServer";

export async function AppLayoutBody({ children }: { children: React.ReactNode }) {
  const customer = await getCurrentCustomer();
  const [initialGridPreferences, initialFriendsUnreadCount] = await Promise.all([
    customer ? fetchCustomerGridPreferences(customer.id) : Promise.resolve(null),
    customer
      ? (async () => {
          const supabase = await createSupabaseServerClient();
          return countUnreadTradeNotifications(supabase);
        })()
      : Promise.resolve(0),
  ]);

  return (
    <CardGridPreferencesProvider initial={initialGridPreferences} isLoggedIn={Boolean(customer)}>
      <DevRuntimeGuards />
      <PullToRefresh />
      <UniversalSearch isLoggedIn={Boolean(customer)} />
      <BottomNav
        key={`${customer?.id ?? "guest"}:${initialFriendsUnreadCount}`}
        isLoggedIn={Boolean(customer)}
        initialFriendsUnreadCount={initialFriendsUnreadCount}
      />
      <div className="relative z-0 flex min-h-0 flex-1 flex-col pb-[var(--bottom-nav-offset)] pt-[var(--top-search-offset)]">
        {children}
      </div>
    </CardGridPreferencesProvider>
  );
}
