import { DashboardShell } from "@/components/DashboardShell";
import { getCurrentCustomer } from "@/lib/auth";

export default async function DashboardPage() {
  const customer = await getCurrentCustomer();
  const displayName =
    customer?.firstName?.trim() || customer?.email?.split("@")[0]?.trim() || "Trainer";

  return <DashboardShell isLoggedIn={Boolean(customer)} displayName={displayName} />;
}
