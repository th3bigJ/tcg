import { ExpansionsList } from "@/components/ExpansionsList";
import {
  getCachedExpansionSetRows,
  groupExpansionSetsBySeries,
} from "@/lib/expansionsPageQueries";

export default async function ExpansionsPage() {
  const rows = await getCachedExpansionSetRows();
  const groups = groupExpansionSetsBySeries(rows);

  return (
    <main className="min-h-full bg-[var(--background)] px-4 pb-8 pt-4 text-[var(--foreground)]">
      <ExpansionsList groups={groups} />
    </main>
  );
}
