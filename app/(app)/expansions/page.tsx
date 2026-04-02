import Link from "next/link";
import { ExpansionsList } from "@/components/ExpansionsList";
import { getCurrentCustomer } from "@/lib/auth";
import { getCachedExpansionSetRows, groupExpansionSetsBySeries } from "@/lib/expansionsPageQueries";
import { fetchCollectionCardEntries, fetchWishlistCardEntries } from "@/lib/storefrontCardMapsServer";

type ExpansionsIndexPageProps = {
  searchParams?: Promise<Record<string, string>>;
};

export default async function ExpansionsIndexPage({ searchParams }: ExpansionsIndexPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const customer = await getCurrentCustomer();
  const [rows, collectionEntries, wishlistEntries] = await Promise.all([
    getCachedExpansionSetRows(),
    customer ? fetchCollectionCardEntries(customer.id) : Promise.resolve([]),
    customer ? fetchWishlistCardEntries(customer.id) : Promise.resolve([]),
  ]);

  let uniqueOwnedBySetCode: Record<string, number> | null = null;
  let uniqueWishlistedBySetCode: Record<string, number> | null = null;
  const seenBySetCode = new Map<string, Set<string>>();
  const wishlistedSeenBySetCode = new Map<string, Set<string>>();

  if (customer) {
    uniqueOwnedBySetCode = {};
    uniqueWishlistedBySetCode = {};

    for (const entry of collectionEntries) {
      const setCode = typeof entry.set === "string" ? entry.set.trim() : "";
      if (!setCode || setCode === "unknown") continue;
      const uniqueCardKey =
        entry.masterCardId ??
        [entry.set, entry.cardNumber, entry.filename].filter((value) => Boolean(value)).join("|");
      if (!uniqueCardKey) continue;
      const seen = seenBySetCode.get(setCode) ?? new Set<string>();
      seen.add(uniqueCardKey);
      seenBySetCode.set(setCode, seen);
    }

    for (const entry of wishlistEntries) {
      const setCode = typeof entry.set === "string" ? entry.set.trim() : "";
      if (!setCode || setCode === "unknown") continue;
      const uniqueCardKey =
        entry.masterCardId ??
        [entry.set, entry.cardNumber, entry.filename].filter((value) => Boolean(value)).join("|");
      if (!uniqueCardKey) continue;
      const seen = wishlistedSeenBySetCode.get(setCode) ?? new Set<string>();
      seen.add(uniqueCardKey);
      wishlistedSeenBySetCode.set(setCode, seen);
    }

    for (const [setCode, seen] of seenBySetCode.entries()) {
      uniqueOwnedBySetCode[setCode] = seen.size;
    }
    for (const [setCode, seen] of wishlistedSeenBySetCode.entries()) {
      uniqueWishlistedBySetCode[setCode] = seen.size;
    }
  }

  const groups = groupExpansionSetsBySeries(rows);
  const backHref =
    typeof resolvedSearchParams.return_to === "string" && resolvedSearchParams.return_to.startsWith("/")
      ? resolvedSearchParams.return_to
      : "/search";
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-4 pt-0">
        <header className="mb-2 flex shrink-0 items-center gap-2 border-b border-[var(--foreground)]/10 pb-1.5">
          <Link
            href={backHref}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--foreground)] transition hover:bg-[var(--foreground)]/8"
            aria-label="Back to search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <div className="flex min-h-9 items-center">
            <h1 className="leading-none text-base font-semibold">Select a Set</h1>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1.5rem,var(--bottom-nav-offset))]">
          <ExpansionsList
            groups={groups}
            uniqueOwnedBySetCode={uniqueOwnedBySetCode}
            uniqueWishlistedBySetCode={uniqueWishlistedBySetCode}
            searchSelectionParams={resolvedSearchParams}
          />
        </div>
      </main>
    </div>
  );
}
