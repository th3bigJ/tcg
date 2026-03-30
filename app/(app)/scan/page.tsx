import dynamic from "next/dynamic";
import { getCurrentCustomer } from "@/lib/auth";

export const metadata = {
  title: "Browser Scan Lab",
};

const OnnxScanLab = dynamic(
  () => import("@/components/OnnxScanLab").then((m) => ({ default: m.OnnxScanLab })),
  { ssr: false },
);

export default async function ScanPage() {
  const customer = await getCurrentCustomer();
  return <OnnxScanLab customerLoggedIn={!!customer} />;
}
