import { DevRuntimeGuards } from "@/app/(app)/DevRuntimeGuards";
import { BottomNav } from "@/components/BottomNav";
import { CardGridPreferencesProvider } from "@/components/CardGridPreferencesProvider";
import { PullToRefresh } from "@/components/PullToRefresh";
import { UniversalSearch } from "@/components/UniversalSearch";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchCustomerGridPreferences } from "@/lib/customerPreferencesServer";
import type { GridPreferences } from "@/lib/gridPreferences";

type AppLayoutChromeProps = {
  children: React.ReactNode;
  initialGridPreferences: GridPreferences | null;
  isLoggedIn: boolean;
};

export async function AppLayoutBody({ children }: { children: React.ReactNode }) {
  const customer = await getCurrentCustomer();
  const initialGridPreferences = customer ? await fetchCustomerGridPreferences(customer.id) : null;

  return (
    <AppLayoutChrome
      initialGridPreferences={initialGridPreferences}
      isLoggedIn={Boolean(customer)}
    >
      {children}
    </AppLayoutChrome>
  );
}

export function AppLayoutChrome({
  children,
  initialGridPreferences,
  isLoggedIn,
}: AppLayoutChromeProps) {
  return (
    <CardGridPreferencesProvider initial={initialGridPreferences} isLoggedIn={isLoggedIn}>
      <DevRuntimeGuards />
      <PullToRefresh />
      <UniversalSearch isLoggedIn={isLoggedIn} />
      <BottomNav key={isLoggedIn ? "member" : "guest"} />
      <div className="app-menu-push-target relative z-0 flex min-h-0 flex-1 flex-col pb-[var(--bottom-nav-offset)] pt-[var(--top-search-offset)]">
        {children}
      </div>
    </CardGridPreferencesProvider>
  );
}
