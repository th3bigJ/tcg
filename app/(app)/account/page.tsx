import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountSignOut } from "@/components/AccountSignOut";
import { getCurrentCustomer } from "@/lib/auth";

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
      <h1 className="text-xl font-semibold">Account</h1>
      <p className="mt-4 text-sm">
        <span className="text-[var(--foreground)]/65">Name</span>
        <br />
        <span className="font-medium">
          {customer.firstName} {customer.lastName}
        </span>
      </p>
      <p className="mt-3 text-sm">
        <span className="text-[var(--foreground)]/65">Email</span>
        <br />
        <span className="font-medium">{customer.email}</span>
      </p>
      <div className="mt-8 flex flex-col gap-3 text-sm font-medium">
        <Link
          href="/"
          className="w-fit rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 transition hover:bg-[var(--foreground)]/18"
        >
          My collection
        </Link>
        <Link
          href="/wishlist"
          className="w-fit rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 transition hover:bg-[var(--foreground)]/18"
        >
          Wishlist
        </Link>
      </div>
      <AccountSignOut />
    </div>
  );
}
