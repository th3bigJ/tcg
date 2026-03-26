import { getCurrentCustomer } from "@/lib/auth";
import { ScanPage } from "@/components/ScanPage";

export const dynamic = "force-dynamic";

export const metadata = { title: "Scan Card" };

export default async function ScanRoute() {
  const customer = await getCurrentCustomer();
  return <ScanPage customerLoggedIn={!!customer} />;
}
