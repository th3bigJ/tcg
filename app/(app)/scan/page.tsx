import { getCurrentCustomer } from "@/lib/auth";
import { OnnxScanLabClient } from "@/components/OnnxScanLabClient";

export const metadata = {
  title: "Browser Scan Lab",
};

export default async function ScanPage() {
  const customer = await getCurrentCustomer();
  return <OnnxScanLabClient customerLoggedIn={!!customer} />;
}
