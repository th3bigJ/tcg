import { OnnxScanLab } from "@/components/OnnxScanLab";
import { getCurrentCustomer } from "@/lib/auth";

export const metadata = {
  title: "Browser Scan Lab",
};

export default async function ScanPage() {
  const customer = await getCurrentCustomer();
  return <OnnxScanLab customerLoggedIn={!!customer} />;
}
