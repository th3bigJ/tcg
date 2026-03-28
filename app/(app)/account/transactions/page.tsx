import { redirect } from "next/navigation";

import { getCurrentCustomer } from "@/lib/auth";
import { PRODUCT_TYPES } from "@/lib/referenceData";
import { TransactionsClient } from "./TransactionsClient";

export default async function TransactionsPage() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <TransactionsClient productTypes={PRODUCT_TYPES} />
    </div>
  );
}
