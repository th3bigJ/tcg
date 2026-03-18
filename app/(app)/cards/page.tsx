import fs from "fs/promises";
import path from "path";
import Link from "next/link";
import { CardGrid } from "@/components/CardGrid";

const LOW_CARDS_BASE = path.join(process.cwd(), "public", "media", "cards", "low");

type CardEntry = { set: string; filename: string; src: string };

async function getLowResCards(): Promise<CardEntry[]> {
  const entries: CardEntry[] = [];
  const setDirs = await fs.readdir(LOW_CARDS_BASE, { withFileTypes: true });
  for (const dirent of setDirs) {
    if (!dirent.isDirectory()) continue;
    const setPath = path.join(LOW_CARDS_BASE, dirent.name);
    const files = await fs.readdir(setPath);
    const imageFiles = files.filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f));
    for (const filename of imageFiles.sort()) {
      entries.push({
        set: dirent.name,
        filename,
        src: `/media/cards/low/${dirent.name}/${filename}`,
      });
    }
  }
  return entries.sort((a, b) => {
    if (a.set !== b.set) return a.set.localeCompare(b.set);
    return a.filename.localeCompare(b.filename, undefined, { numeric: true });
  });
}

export default async function CardsPage() {
  const cards = await getLowResCards();

  return (
    <div className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--foreground)]/10 bg-[var(--background)] px-4 py-4">
        <div className="flex w-full items-center justify-between">
          <h1 className="text-xl font-semibold">Low-res card gallery</h1>
          <Link
            href="/"
            className="text-sm underline underline-offset-2 hover:no-underline"
          >
            ← Home
          </Link>
        </div>
      </header>
      <main className="w-full px-4 py-6">
        <p className="mb-6 text-sm text-[var(--foreground)]/70">
          {cards.length} card{cards.length === 1 ? "" : "s"} in{" "}
          {[...new Set(cards.map((c) => c.set))].length} set
          {[...new Set(cards.map((c) => c.set))].length === 1 ? "" : "s"}
        </p>
        <CardGrid cards={cards} />
      </main>
    </div>
  );
}
