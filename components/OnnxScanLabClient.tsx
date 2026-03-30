"use client";

import dynamic from "next/dynamic";

const OnnxScanLabDynamic = dynamic(
  () => import("@/components/OnnxScanLab").then((m) => ({ default: m.OnnxScanLab })),
  { ssr: false },
);

export function OnnxScanLabClient({ customerLoggedIn }: { customerLoggedIn: boolean }) {
  return <OnnxScanLabDynamic customerLoggedIn={customerLoggedIn} />;
}
