# Build Plan — Card Pricing, Accounts, Collection & Wishlist

## Current State

- Phase 1–3 complete: card database seeded, card/set/pokédex browsing fully working
- `Users` collection exists but is **admin-only** (no public registration)
- `/app/(app)/page.tsx` — Collection page is a stub
- `/app/(app)/wishlist/page.tsx` — Wishlist page is a stub
- Each `MasterCardList` record has an `externalId` field (e.g. `xyp-XY01`) — this is the pokemontcg.io card ID

## What We're Building

Four things in order:

1. **Card Pricing** — fetch and display live market prices when a card is opened
2. **Customer Accounts** — public-facing registration, login, session
3. **Collection** — authenticated users track cards they own
4. **Wishlist** — authenticated users track cards they want

---

## Phase A — Card Pricing Display

> Show live TCGPlayer + Cardmarket prices when a user opens a card.
> No store pricing, no SKUs. Just market data from an external API.

### How it works

pokemontcg.io returns price data alongside card details. The card's `externalId`
in your database is the pokemontcg.io card ID (e.g. `xyp-XY01`, `base1-4`).

**pokemontcg.io price response shape:**
```json
{
  "id": "base1-4",
  "name": "Charizard",
  "tcgplayer": {
    "updatedAt": "2024/01/15",
    "prices": {
      "holofoil": {
        "low": 180.00,
        "mid": 250.00,
        "high": 450.00,
        "market": 230.00,
        "directLow": null
      },
      "reverseHolofoil": { "low": ..., "mid": ..., "high": ..., "market": ... },
      "normal": { "low": ..., "mid": ..., "high": ..., "market": ... }
    }
  },
  "cardmarket": {
    "updatedAt": "2024/01/15",
    "prices": {
      "averageSellPrice": 220.00,
      "lowPrice": 150.00,
      "trendPrice": 235.00,
      "avg1": 240.00,
      "avg7": 228.00,
      "avg30": 215.00
    }
  }
}
```

### A1 — Create `/app/api/card-prices/[externalId]/route.ts`

A server-side proxy route that fetches price data from pokemontcg.io and returns
only the price fields. Proxying server-side keeps your API key secret and lets you
add caching later.

```typescript
// GET /api/card-prices/base1-4
export async function GET(req: Request, { params }: { params: { externalId: string } }) {
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards/${params.externalId}`,
    {
      headers: {
        // Optional — add to .env.local as POKEMON_TCG_API_KEY
        // Free tier works without it but has lower rate limits
        ...(process.env.POKEMON_TCG_API_KEY
          ? { 'X-Api-Key': process.env.POKEMON_TCG_API_KEY }
          : {}),
      },
      next: { revalidate: 60 * 60 * 6 }, // cache for 6 hours — prices don't change that fast
    }
  )

  if (!res.ok) return Response.json({ tcgplayer: null, cardmarket: null })

  const { data } = await res.json()
  return Response.json({
    tcgplayer: data.tcgplayer ?? null,
    cardmarket: data.cardmarket ?? null,
  })
}
```

### A2 — Add price display to the card detail view

Find wherever a card is shown in detail (card modal, card detail page, or the
card viewer in the carousel). Fetch prices client-side when the card opens:

```typescript
// In your card detail component
const [prices, setPrices] = useState(null)

useEffect(() => {
  if (!card.externalId) return
  fetch(`/api/card-prices/${card.externalId}`)
    .then(r => r.json())
    .then(setPrices)
}, [card.externalId])
```

**Display:**
- Show TCGPlayer market price as the headline price (most recognisable)
- Show low/mid/high as a secondary range
- Show Cardmarket trend price for European context
- If the card has multiple printings (holofoil, reverse, normal), show a tab or
  dropdown to switch between them
- Show "Prices via TCGPlayer / Cardmarket" attribution + the `updatedAt` date
- If `externalId` is missing or the API returns null prices: show "Price unavailable"

**Example UI layout:**
```
┌─────────────────────────────┐
│  TCGPlayer                  │
│  Market  £230.00            │
│  Low £180 · High £450       │
│                             │
│  Cardmarket                 │
│  Trend   £235.00            │
│  30-day avg  £215.00        │
│                             │
│  Updated 15 Jan 2024        │
└─────────────────────────────┘
```

### A3 — `.env.local` entry

Add to `.env.local` (optional but recommended):
```
POKEMON_TCG_API_KEY=your_key_here
```

Free keys available at https://pokemontcg.io — raises rate limit from 1,000 to
20,000 requests/day. The `next: { revalidate }` cache on the route handler means
you won't hit limits in normal use.

---

## Phase B — Customer Accounts

> Public-facing registration and login. Separate from the admin `Users` collection.

### B1 — Create `collections/Customers.ts`

A new Payload auth collection for public users. **Do not modify the existing
`Users` collection** — that stays admin-only.

```typescript
// collections/Customers.ts
{
  slug: 'customers',
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30, // 30 days
    useAPIKey: false,
  },
  access: {
    create: () => true,       // public registration
    read: isAdminOrSelf,      // can only read own record
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  fields: [
    { name: 'firstName', type: 'text', required: true },
    { name: 'lastName',  type: 'text', required: true },
    // email is auto-added by Payload auth
  ],
}
```

Add `isAdminOrSelf` helper to `lib/access.ts`:
```typescript
export const isAdminOrSelf = ({ req }: { req: PayloadRequest }) => {
  if (req.user && 'collection' in req.user && req.user.collection === 'users') return true
  if (req.user) return { id: { equals: req.user.id } }
  return false
}
```

Register `Customers` in `payload.config.ts`.

### B2 — Auth API routes

Payload auto-generates these once `auth: true` is set — no extra code needed:
- `POST /api/customers/login`
- `POST /api/customers/logout`
- `POST /api/customers` — register
- `GET /api/customers/me`

### B3 — Auth UI pages

- `/app/(app)/login/page.tsx`
  - Email + password form
  - POST to `/api/customers/login`
  - On success: store token in `httpOnly` cookie via a Server Action or Route Handler, redirect to `/`
- `/app/(app)/register/page.tsx`
  - First name, last name, email, password
  - POST to `/api/customers`
  - On success: auto-login, redirect to `/`
- `/app/(app)/account/page.tsx` (protected)
  - Show name, email
  - Links to collection and wishlist

### B4 — Session helper

Create `lib/auth.ts`:
```typescript
// Returns the current customer validated server-side
// Use in Server Components and Route Handlers
export async function getCurrentCustomer(): Promise<Customer | null>
```

Use `payload.auth({ headers: req.headers })` to validate the token.

### B5 — Update BottomNav

Add an account icon that links to `/account` when logged in, `/login` when not.
Read auth state server-side in the layout.

---

## Phase C — Collection (Cards I Own)

> Authenticated customers track which cards they own and in what condition.

### C1 — Create `collections/CustomerCollections.ts`

```
- customer (relationship → Customers, required)
- masterCard (relationship → MasterCardList, required)
- condition (relationship → ItemConditions)
- printing (select: Standard | Reverse Holo | Holo | First Edition | Shadowless | other, default: Standard)
- language (select: English | Japanese | Korean | Chinese | German | French | Italian | Spanish | Portuguese, default: English)
- quantity (number, default: 1)
- gradingCompany (select: PSA | BGS | CGC | SGC | ACE | Other | none, default: none)
- gradeValue (text — e.g. "9", "9.5", "10")
- notes (textarea)
- addedAt (date — auto on create)
```

Access:
- `create`: authenticated customers only; `beforeChange` hook forces `customer = req.user.id`
- `read/update/delete`: own records only (`{ customer: { equals: req.user.id } }`)
- Admin: full access

### C2 — Collection API routes

`/app/api/collection/route.ts`:
- `GET` — return customer's collection (`payload.find` filtered by customer)
- `POST` — add a card (`{ masterCardId, conditionId, quantity, printing, language }`)
- `DELETE ?id=` — remove an entry

### C3 — Wire up `/app/(app)/page.tsx`

- Not logged in → "Sign in to track your collection" + link to `/login`
- Logged in → card grid using the existing `CardGrid` component
  - Each card shows: image, name, set, condition badge, quantity
  - Grouped by set or sorted by date added

### C4 — Add to collection UI

On the `/cards` page and card detail view, add a `+` button. On click:
- Not logged in → redirect to `/login`
- Logged in → small bottom sheet with condition + quantity + printing selectors → `POST /api/collection`

---

## Phase D — Wishlist (Cards I Want)

> Authenticated customers save cards they want to acquire.

### D1 — Create `collections/CustomerWishlists.ts`

```
- customer (relationship → Customers, required)
- masterCard (relationship → MasterCardList, required)
- targetCondition (relationship → ItemConditions)
- targetPrinting (select: Standard | Reverse Holo | Holo | First Edition | Shadowless | other)
- maxPrice (number — optional, GBP — alert if market drops below this)
- priority (select: low | medium | high, default: medium)
- notes (textarea)
- addedAt (date — auto on create)
```

Access: same own-records-only pattern as `CustomerCollections`.

### D2 — Wishlist API routes

`/app/api/wishlist/route.ts`:
- `GET` — customer's wishlist
- `POST` — add a card (`{ masterCardId, targetConditionId, targetPrinting, maxPrice, priority }`)
- `DELETE ?id=` — remove

### D3 — Wire up `/app/(app)/wishlist/page.tsx`

- Not logged in → "Sign in to save cards to your wishlist"
- Logged in → card grid with priority badges, target condition, current market price (reuse Phase A pricing component)
- "Move to collection" button → `POST /api/collection` then `DELETE /api/wishlist`
- "Remove" button

### D4 — Heart button

On `/cards` page and card detail view, add a heart icon:
- Filled = already in wishlist; hollow = not in wishlist
- Click toggles: `POST /api/wishlist` or `DELETE /api/wishlist`

---

## File Checklist

### New collections
- [ ] `collections/Customers.ts`
- [ ] `collections/CustomerCollections.ts`
- [ ] `collections/CustomerWishlists.ts`

### Updated config
- [ ] `payload.config.ts` — register all new collections

### New lib/helpers
- [ ] `lib/access.ts` — add `isAdminOrSelf`
- [ ] `lib/auth.ts` — `getCurrentCustomer()` helper

### New API routes
- [ ] `app/api/card-prices/[externalId]/route.ts`
- [ ] `app/api/collection/route.ts`
- [ ] `app/api/wishlist/route.ts`

### New pages
- [ ] `app/(app)/login/page.tsx`
- [ ] `app/(app)/register/page.tsx`
- [ ] `app/(app)/account/page.tsx`

### Updated pages
- [ ] `app/(app)/page.tsx` — wire up collection
- [ ] `app/(app)/wishlist/page.tsx` — wire up wishlist
- [ ] Card detail view — add price display + add-to-collection + heart button

### Updated components
- [ ] `components/BottomNav.tsx` — add Account link

---

## Build Order

1. Pricing route + price display on card detail → no auth needed, ships immediately
2. `Customers` collection → login/register pages → session helper
3. `CustomerCollections` → collection API → wire up collection page → add-to-collection UI
4. `CustomerWishlists` → wishlist API → wire up wishlist page → heart button

---

## Notes

- Read `node_modules/next/dist/docs/` before writing any Next.js code — this version has breaking changes
- Use Payload Local API (not REST fetch) inside Server Components and Route Handlers
- `Customers` must stay **separate** from `Users` — never merge them
- pokemontcg.io `externalId` format matches your `MasterCardList.externalId` field exactly — no transformation needed
- Cards with no `externalId` (manually added) will silently return no price — handle gracefully in the UI
- Reuse `CardGrid` in both the collection and wishlist pages
