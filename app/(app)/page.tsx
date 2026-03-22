import Link from "next/link";

export default function CollectionPage() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
      <h1 className="text-xl font-semibold">Collection</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">
        Your personal collection will show here. Browse the full card database from Search.
      </p>
      <Link
        href="/cards"
        className="mt-6 inline-flex w-fit rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
      >
        Search cards
      </Link>
    </div>
  );
}
