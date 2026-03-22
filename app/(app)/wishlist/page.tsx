export default function WishlistPage() {
  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 py-6 text-[var(--foreground)]">
      <h1 className="text-xl font-semibold">Wishlist</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">
        Cards you want to pick up will appear here.
      </p>
    </div>
  );
}
