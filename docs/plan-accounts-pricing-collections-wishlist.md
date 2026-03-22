# Build Plan — Accounts, Pricing, Collections & Wishlist

## Current State

- Phase 1–3 complete: card database seeded, card/set/pokédex browsing fully working
- `Users` collection exists but is **admin-only** (no public registration)
- `/app/(app)/page.tsx` — Collection page is a stub
- `/app/(app)/wishlist/page.tsx` — Wishlist page is a stub
- No SKU Items, Inventory, or pricing collections yet

## What We're Building

Four things in order:

1. **SKU Items + Pricing** — product listings with prices (Phase 4 from build-plan.md)
2. **Customer Accounts** — public-facing registration, login, session
3. **Collection** — authenticated users track cards they own
4. **Wishlist** — authenticated users track cards they want

---

## Phase A — SKU Items & Pricing (Phase 4 from build-plan.md)

> Enables the store to have priced products. Required before checkout can exist.

### A1 — Create `collections/SkuItems.ts`

Fields per `docs/database.md`:

```
- title (text, required)
- slug (text, required, unique) — auto-generate from title
- skuCode (text, required, unique — e.g. "PKM-SVI-001-NM")
- brand (relationship → Brands)
- set (relationship → Sets)
- productType (relationship → Product Types, required)
- productCategory (relationship → Product Categories)
- masterCard (relationship → MasterCardList, optional)
- description (richText)
- images (array of upload → Media)
- isActive (boolean, default: true)
- isPublished (boolean, default: false)
- inventoryMode (select: quantity | unique, default: quantity) — only build quantity for v1
- trackInventory (boolean, default: true)

Pricing group:
- price (number, required — GBP)
- compareAtPrice (number)
- costPrice (number)
- taxClass (select: standard | zero | exempt, default: standard)

Logistics group:
- barcode (text)
- weight (number — grams)
- dimensions group: length, width, height (number — mm)

Metadata:
- attributes (json)
- notes (textarea)
```

Access: read → `isPublished === true` for public; full access for admin.

### A2 — Create `collections/Inventory.ts`

Fields per `docs/database.md`:

```
- skuItem (relationship → SkuItems, required)
- condition (relationship → ItemConditions, required)
- language (select: English | Japanese | Korean | Chinese | German | French | Italian | Spanish | Portuguese, default: English)
- printing (select: Standard | Reverse Holo | Holo | First Edition | Shadowless | other, default: Standard)

Stock:
- quantityOnHand (number, default: 0)
  NOTE: quantityReserved and quantityAvailable are NOT in v1

Grading:
- gradingCompany (select: PSA | BGS | CGC | SGC | ACE | Other | none, default: none)
- gradeValue (text — e.g. "9", "9.5", "10")

Status:
- status (select: active | sold_out | archived | damaged_hold, default: active)
- notes (textarea)
- lastUpdatedAt (date — auto-update on change via beforeChange hook)
```

Access: admin only (customers never see raw inventory records).

### A3 — Register both collections in `payload.config.ts`

Add `SkuItems` and `Inventory` to the collections array.

### A4 — Product listing page

- `/app/(app)/shop/page.tsx` — grid of published SKU Items
- Fetch via Payload Local API: `payload.find({ collection: 'sku-items', where: { isPublished: { equals: true } } })`
- Show: card image (from `masterCard.imageHigh`), title, price, condition
- `/app/(app)/shop/[slug]/page.tsx` — product detail page
- Show full details + price + add-to-wishlist button (wired up in Phase D)

### A5 — Add Shop to BottomNav

Add a shop/bag icon route `/shop` to `components/BottomNav.tsx`.

---

## Phase B — Customer Accounts

> Public-facing registration and login. Separate from the admin `Users` collection.

### B1 — Create `collections/Customers.ts`

A new Payload auth collection for public users. **Do not modify the existing `Users` collection** — that stays admin-only.

```typescript
// collections/Customers.ts
{
  slug: 'customers',
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30, // 30 days
    useAPIKey: false,
  },
  access: {
    create: () => true,         // public registration
    read: isAdminOrSelf,        // can only read own record
    update: isAdminOrSelf,
    delete: isAdmin,
  },
  fields: [
    { name: 'firstName', type: 'text', required: true },
    { name: 'lastName', type: 'text', required: true },
    // email is auto-added by Payload auth
  ],
}
```

Add `isAdminOrSelf` helper to `lib/access.ts`:
```typescript
export const isAdminOrSelf = ({ req }: { req: PayloadRequest }) => {
  if (req.user && 'collection' in req.user && req.user.collection === 'users') return true;
  if (req.user) return { id: { equals: req.user.id } };
  return false;
};
```

Register `Customers` in `payload.config.ts`.

### B2 — Auth API routes

Payload auto-generates these REST endpoints once `auth: true` is set:
- `POST /api/customers/login` — login
- `POST /api/customers/logout` — logout
- `POST /api/customers` — register (create)
- `GET /api/customers/me` — get current session

### B3 — Auth UI pages

- `/app/(app)/login/page.tsx` — login form
  - Email + password fields
  - POST to `/api/customers/login`
  - On success: store token in `httpOnly` cookie (use Next.js `cookies()` in a Server Action or Route Handler), redirect to `/`
- `/app/(app)/register/page.tsx` — registration form
  - First name, last name, email, password fields
  - POST to `/api/customers` (Payload create endpoint)
  - On success: auto-login (call login endpoint), redirect to `/`
- `/app/(app)/account/page.tsx` — account page (protected)
  - Show name, email
  - Link to collection and wishlist

### B4 — Session helper

Create `lib/auth.ts`:
```typescript
// Returns the current customer from the Payload token cookie
// Use in Server Components and Route Handlers
export async function getCurrentCustomer(): Promise<Customer | null>
```

Use `payload.auth({ headers: req.headers })` to validate the token server-side.

### B5 — Update BottomNav

Replace any hardcoded user icon with a link to `/account` (or `/login` if not authenticated). Read auth state server-side in the layout component.

---

## Phase C — Collection (Cards I Own)

> Authenticated customers track which cards they own and in what condition.

### C1 — Create `collections/CustomerCollections.ts`

```
- customer (relationship → Customers, required)
- masterCard (relationship → MasterCardList, required)
- condition (relationship → ItemConditions)
- printing (select: Standard | Reverse Holo | Holo | First Edition | Shadowless | other, default: Standard)
- language (select: English | Japanese | ..., default: English)
- quantity (number, default: 1)
- gradingCompany (select: PSA | BGS | CGC | SGC | ACE | Other | none, default: none)
- gradeValue (text)
- notes (textarea)
- addedAt (date — auto on create)
```

Access:
- create: authenticated customer (can only create for themselves)
- read: own records only (`{ customer: { equals: req.user.id } }`)
- update: own records only
- delete: own records only
- admin: full access

Enforce "own records only" with a `beforeOperation` hook that sets `customer` to `req.user.id` on create.

### C2 — Collection API routes

Create `/app/api/collection/route.ts`:
- `GET` — list customer's collection (calls `payload.find` with customer filter)
- `POST` — add a card (`{ masterCardId, conditionId, quantity, printing, language }`)
- `DELETE ?id=` — remove a card

### C3 — Wire up `/app/(app)/page.tsx`

Replace the stub with a real collection grid:
- Fetch from `GET /api/collection`
- If not logged in: show "Sign in to track your collection" with link to `/login`
- If logged in: show card grid (reuse `CardGrid` component), grouped by set or sorted by date added
- Each card shows: card image, name, set, condition badge, quantity
- "Add to collection" button on each card in `/shop/[slug]/page.tsx` and `/cards` page

### C4 — Add card on the cards page

On the `/cards` page card grid, add a small `+` icon on hover. On click:
- If not logged in: redirect to `/login`
- If logged in: open a small modal/sheet with condition + quantity selectors, then call `POST /api/collection`

---

## Phase D — Wishlist (Cards I Want)

> Authenticated customers save cards they want to buy.

### D1 — Create `collections/CustomerWishlists.ts`

```
- customer (relationship → Customers, required)
- masterCard (relationship → MasterCardList, required)
- targetCondition (relationship → ItemConditions — condition they want)
- targetPrinting (select: Standard | Reverse Holo | Holo | First Edition | Shadowless | other)
- maxPrice (number — optional, GBP — won't buy above this price)
- priority (select: low | medium | high, default: medium)
- notes (textarea)
- addedAt (date — auto on create)
```

Access: same pattern as `CustomerCollections` — own records only.

### D2 — Wishlist API routes

Create `/app/api/wishlist/route.ts`:
- `GET` — list customer's wishlist
- `POST` — add a card (`{ masterCardId, targetConditionId, targetPrinting, maxPrice, priority }`)
- `DELETE ?id=` — remove

### D3 — Wire up `/app/(app)/wishlist/page.tsx`

Replace the stub:
- Fetch from `GET /api/wishlist`
- If not logged in: show "Sign in to save cards to your wishlist"
- If logged in: show card grid with priority badges, target condition, max price
- "Move to collection" button — calls `POST /api/collection` then `DELETE /api/wishlist`
- "Remove" button

### D4 — Add to wishlist button

On `/cards` page and `/shop/[slug]/page.tsx`, add a heart icon button:
- Toggles the card in the wishlist (`POST /api/wishlist` or `DELETE /api/wishlist`)
- Heart fills if already in wishlist

---

## File Checklist

### New collections
- [ ] `collections/SkuItems.ts`
- [ ] `collections/Inventory.ts`
- [ ] `collections/Customers.ts`
- [ ] `collections/CustomerCollections.ts`
- [ ] `collections/CustomerWishlists.ts`

### Updated config
- [ ] `payload.config.ts` — register all new collections

### New lib/helpers
- [ ] `lib/access.ts` — add `isAdminOrSelf`
- [ ] `lib/auth.ts` — `getCurrentCustomer()` helper

### New API routes
- [ ] `app/api/collection/route.ts`
- [ ] `app/api/wishlist/route.ts`

### New pages
- [ ] `app/(app)/shop/page.tsx`
- [ ] `app/(app)/shop/[slug]/page.tsx`
- [ ] `app/(app)/login/page.tsx`
- [ ] `app/(app)/register/page.tsx`
- [ ] `app/(app)/account/page.tsx`

### Updated pages
- [ ] `app/(app)/page.tsx` — wire up collection
- [ ] `app/(app)/wishlist/page.tsx` — wire up wishlist

### Updated components
- [ ] `components/BottomNav.tsx` — add Shop + Account links

---

## Build Order

Build in this sequence — each step depends on the previous:

1. `SkuItems` + `Inventory` collections → register in config → product listing page
2. `Customers` collection → auth pages (login/register) → session helper
3. `CustomerCollections` → collection API route → wire up collection page → add-to-collection UI
4. `CustomerWishlists` → wishlist API route → wire up wishlist page → heart button UI

---

## Notes

- Read `node_modules/next/dist/docs/` before writing any Next.js code — this version has breaking changes
- All prices are GBP
- Use Payload Local API (not REST) inside Server Components and API routes — it's faster and avoids HTTP overhead
- The `Customers` collection must be a **separate auth collection** from `Users` — never merge them. Admin users log in at `/admin`, customers log in at `/login`
- Reuse the existing `CardGrid` component in both the collection and wishlist pages
- Do not add `quantityReserved` or `quantityAvailable` to Inventory — that's a later phase
