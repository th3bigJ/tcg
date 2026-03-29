# Performance Optimization Recommendations

The Pokémon TCG app processes large amounts of static data (Sets, Pokémon list) and dynamic data (Master Cards, Prices). To ensure "instant" tab switching and a premium, responsive feel, we should leverage the latest Next.js 16 features.

## 1. Implement `use cache` for Static Filter Data
Currently, `getCachedSetFilterOptions` and `getCachedPokemonFilterOptions` re-process static JSON/data on every request. While fast, this adds up when combined with other fetches.

> [!TIP]
> Use the new `use cache` directive (Next.js 16/15) to cache the results of these data transformations across all users and requests.

```tsx
// lib/cardsFilterOptionsServer.ts
export async function getCachedPokemonFilterOptions() {
  'use cache' // Caches the result globally
  const raw = require("../data/pokemon.json");
  // ... process data ...
  return options;
}
```

## 2. Enable "Instant Navigation" for Tabs
The Pokedex, Sets, and Search tabs should feel like a native app. We can achieve this by exporting `unstable_instant` from their route segments.

> [!IMPORTANT]
> This generates a **Static Shell** that is prefetched and rendered instantly while the dynamic content (card results) streams in via Suspense.

```tsx
// app/(app)/pokedex/[nationalDex]/page.tsx
export const unstable_instant = { prefetch: 'static' }

export default async function Page({ params }) {
  return (
    <Suspense fallback={<PokedexLoadingSkeleton />}>
      <PokedexContent params={params} />
    </Suspense>
  )
}
```

## 3. Parallelize Data Fetching
Ensure all independent data (User, Facets, Filter Options) are fetched in parallel using `Promise.all` at the top level of Server Components.

## 4. Optical Speed: Optimistic UI & View Transitions
- Use the **Browser View Transitions API** (standard in Next.js 16 for some navigations) to animate between tabs smoothly.
- Ensure `CardGrid` uses `loading="eager"` for the first row of images to prevent layout shift during navigation.

## 5. Webpack vs. Turbopack
The app currently forces `--webpack`. Switching to **Turbopack** (the default in Next.js 16) would significantly improve development iteration speed and potentially production build optimization.
