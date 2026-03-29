import { ExpansionsList } from "@/components/ExpansionsList";
import {
  getCachedExpansionSetRows,
  groupExpansionSetsBySeries,
} from "@/lib/expansionsPageQueries";
import { getCurrentCustomer } from "@/lib/auth";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";

export default async function ExpansionsPage() {
  const [rows, customer] = await Promise.all([getCachedExpansionSetRows(), getCurrentCustomer()]);
  const collectionEntries = customer ? await fetchCollectionCardEntries(customer.id) : [];
  let uniqueOwnedBySetCode: Record<string, number> | null = null;
  const seenBySetCode = new Map<string, Set<string>>();

  if (customer) {
    uniqueOwnedBySetCode = {};
    for (const entry of collectionEntries) {
      const setCode = typeof entry.set === "string" ? entry.set.trim() : "";
      if (!setCode || setCode === "unknown") continue;
      const uniqueCardKey =
        entry.masterCardId ??
        [entry.set, entry.cardNumber, entry.filename].filter((v) => Boolean(v)).join("|");
      if (!uniqueCardKey) continue;
      const seen = seenBySetCode.get(setCode) ?? new Set<string>();
      seen.add(uniqueCardKey);
      seenBySetCode.set(setCode, seen);
    }

    for (const [setCode, seen] of seenBySetCode.entries()) {
      uniqueOwnedBySetCode[setCode] = seen.size;
    }
  }

  const groups = groupExpansionSetsBySeries(rows);

  return (
    <main className="min-h-full bg-[var(--background)] px-4 pb-8 pt-4 text-[var(--foreground)]">
      <ExpansionsList groups={groups} uniqueOwnedBySetCode={uniqueOwnedBySetCode} />
    </main>
  );
}
