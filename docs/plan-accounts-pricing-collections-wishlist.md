# Build Plan — Card Pricing, Accounts, Collection & Wishlist

## Current State

- Phase 1–3 complete: card database seeded, card/set/pokédex browsing fully working
- `Users` collection exists but is **admin-only** (no public registration)
- `/app/(app)/page.tsx` — Collection page is a stub
- `/app/(app)/wishlist/page.tsx` — Wishlist page is a stub
- Each `MasterCardList` record has an `externalId` field (e.g. `swsh3-136`) — this is the TCGdex card ID
- `@tcgdex/sdk` is already installed at `^2.7.1`

## What We're Building

Four things in order:

1. **Card Pricing** — fetch and display live market prices when a card is opened
2. **Customer Accounts** — public-facing registration, login, session
3. **Collection** — authenticated users track cards they own
4. **Wishlist** — authenticated users track cards they want

---

## Phase A — Card Pricing Display

> Show live TCGPlayer + Cardmarket prices when a user opens a card.
> No store pricing, no SKUs. Just market data from TCGdex.

### How it works

TCGdex includes a `pricing` field in every full card response. The card's
`externalId` in your database is the TCGdex card ID (e.g. `swsh3-136`, `base1-4`).
The `@tcgdex/sdk` is already installed — no new dependencies needed.

**TCGdex pricing response shape** (under the `pricing` key on a full card fetch):
```json
{
  "pricing": {
    "tcgplayer": {
      "updatedAt": "2024/01/15",
      "normal":       { "low": 1.50,   "mid": 3.00,   "high": 8.00,   "market": 2.80,  "directLow": 1.20 },
      "holofoil":     { "low": 180.00, "mid": 250.00, "high": 450.00, "market": 230.00, "directLow": null },
      "reverseHolofoil": { "low": 5.00, "mid": 8.00, "high": 20.00, "market": 7.50 }
    },
    "cardmarket": {
      "updatedAt": "2024/01/15",
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

Fields are omitted when there is no value. Not every card has all variants.

### A1 — Create `/app/api/card-prices/[externalId]/route.ts`

A server-side proxy that fetches from TCGdex and returns only the pricing data.
Keeps the fetch server-side so caching is applied consistently.

```typescript
// GET /api/card-prices/swsh3-136
import TCGdex from '@tcgdex/sdk'

const tcgdex = new TCGdex('en')

export async function GET(
  _req: Request,
  { params }: { params: { externalId: string } }
) {
  try {
    const card = await tcgdex.fetch('cards', params.externalId)
    return Response.json({
      tcgplayer: card?.pricing?.tcgplayer ?? null,
      cardmarket: card?.pricing?.cardmarket ?? null,
    }, {
      headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate' }, // 6 hours
    })
  } catch {
    return Response.json({ tcgplayer: null, cardmarket: null })
  }
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
- TCGPlayer market price as the headline (most recognisable to buyers)
- Low / high as a secondary range
- Cardmarket trend price for European context
- If the card has multiple variants (holofoil, reverse, normal), show a toggle
- Attribution: "Prices via TCGdex · TCGPlayer · Cardmarket" + `updatedAt` date
- If `externalId` is missing or pricing is null: show "Price unavailable"

**Example UI layout:**
```
┌─────────────────────────────┐
│  TCGPlayer          USD     │
│  Market  $230.00            │
│  Low $180 · High $450       │
│                             │
│  Cardmarket         EUR     │
│  Trend   €235.00            │
│  30-day avg  €215.00        │
│                             │
│  via TCGdex · Updated today │
└─────────────────────────────┘
```

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
- TCGdex card IDs match your `MasterCardList.externalId` field exactly — no transformation needed
- TCGdex is free, no API key required. The `@tcgdex/sdk` is already installed
- Cards with no `externalId` (manually added) will silently return no price — handle gracefully in the UI
- Reuse `CardGrid` in both the collection and wishlist pages
