import { Suspense } from "react";
import { getCurrentCustomer } from "@/lib/auth";
import { OnnxScanLabClient } from "@/components/OnnxScanLabClient";

export const metadata = {
  title: "Browser Scan Lab",
};

function ScanPageFallback() {
  return <OnnxScanLabClient customerLoggedIn={false} />;
}

async function ScanPageContent() {
  const customer = await getCurrentCustomer();
  return <OnnxScanLabClient customerLoggedIn={!!customer} />;
}

export default function ScanPage() {
  return (
    <Suspense fallback={<ScanPageFallback />}>
      <ScanPageContent />
    </Suspense>
  );
}
