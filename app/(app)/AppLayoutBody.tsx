import { DevRuntimeGuards } from "@/app/(app)/DevRuntimeGuards";
import { BottomNav } from "@/components/BottomNav";
import { CardGridPreferencesProvider } from "@/components/CardGridPreferencesProvider";
import { PullToRefresh } from "@/components/PullToRefresh";
import { UniversalSearch } from "@/components/UniversalSearch";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchCustomerGridPreferences } from "@/lib/customerPreferencesServer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countUnreadTradeNotifications } from "@/lib/tradeNotificationsServer";
import type { GridPreferences } from "@/lib/gridPreferences";

type AppLayoutChromeProps = {
  children: React.ReactNode;
  initialGridPreferences: GridPreferences | null;
  isLoggedIn: boolean;
  initialFriendsUnreadCount: number;
};

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
    <AppLayoutChrome
      initialGridPreferences={initialGridPreferences}
      isLoggedIn={Boolean(customer)}
      initialFriendsUnreadCount={initialFriendsUnreadCount}
    >
      {children}
    </AppLayoutChrome>
  );
}

export function AppLayoutChrome({
  children,
  initialGridPreferences,
  isLoggedIn,
  initialFriendsUnreadCount,
}: AppLayoutChromeProps) {
  return (
    <CardGridPreferencesProvider initial={initialGridPreferences} isLoggedIn={isLoggedIn}>
      <DevRuntimeGuards />
      <PullToRefresh />
      <UniversalSearch isLoggedIn={isLoggedIn} />
      <BottomNav
        key={`${isLoggedIn ? "member" : "guest"}:${initialFriendsUnreadCount}`}
        isLoggedIn={isLoggedIn}
        initialFriendsUnreadCount={initialFriendsUnreadCount}
      />
      <div className="app-menu-push-target relative z-0 flex min-h-0 flex-1 flex-col pb-[var(--bottom-nav-offset)] pt-[var(--top-search-offset)]">
        {children}
      </div>
    </CardGridPreferencesProvider>
  );
}
