export const revalidate = 3600;

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-6 pt-[var(--mobile-page-top-offset)] text-[var(--foreground)]">
      <h1 className="text-xl font-semibold">Home</h1>
    </div>
  );
}
