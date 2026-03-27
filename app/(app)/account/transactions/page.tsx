import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";

import { getCurrentCustomer } from "@/lib/auth";
import { getRelationshipDocumentId } from "@/lib/relationshipId";
import { TransactionsClient } from "./TransactionsClient";

export default async function TransactionsPage() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/login");
  }

  const payload = await getPayload({ config });

  const ptResult = await payload.find({
    collection: "product-types",
    where: { isActive: { equals: true } },
    sort: "name",
    depth: 0,
    limit: 100,
    overrideAccess: true,
  });

  const productTypes = ptResult.docs.map((doc) => ({
    id: String(getRelationshipDocumentId(doc.id) ?? ""),
    name: String((doc as { name?: unknown }).name ?? ""),
    slug: String((doc as { slug?: unknown }).slug ?? ""),
  }));

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <TransactionsClient productTypes={productTypes} />
    </div>
  );
}
