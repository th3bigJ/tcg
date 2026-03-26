# Storefront Build Plan

## Current State

- Payload 3.x embedded in Next.js, PostgreSQL via Supabase
- `CustomerCollections` fully modelled (condition, printing, language, quantity, grading)
- `CatalogCardPricing` exists with GBP market prices from Scrydex
- `Customers` collection bridges Supabase Auth → Payload
- `ItemConditions` includes "Sealed" condition already
- `/shop` route exists as a stub
- No Stripe integration, no inventory, no orders

---

## Phase 1 — Inventory Foundation

### 1.1 — `storeEnabled` flag on Customers

Add a `storeEnabled` checkbox to the `Customers` Payload collection.

- Hidden from all customer-facing API routes
- Only visible/editable in the Payload admin UI
- Access control: only Payload `Users` (admins) can read or write this field
- When checked, the "inventory status" option appears in the add-to-collection UI for that user

### 1.2 — New Payload Collection: `Inventory`

Single source of truth for all stock. An `itemType` field (select: `card`, `product`) controls which fields are shown via conditional logic in the admin UI.

**Shared fields (all items):**

| Field | Type | Notes |
|---|---|---|
| `itemType` | select | `card` or `product` |
| `status` | select | `draft`, `for_sale`, `sold`, `reserved`, `unlisted` |
| `condition` | relationship → item-conditions | includes "Sealed" |
| `pricingMode` | select | `auto` or `manual` |
| `autoPrice` | number (GBP) | read-only, populated by beforeChange hook |
| `manualPrice` | number (GBP) | shown only when pricingMode = `manual` |
| `stockQty` | number | default 1 |
| `sku` | text | auto-generated on creation (e.g. `CARD-00123`, `PROD-00045`) |
| `images` | array of uploads | required for non-card items; optional for cards |
| `notes` | textarea | admin-only |
| `customer` | relationship → customers | who supplied the stock |
| `createdAt` / `updatedAt` | timestamps | auto-managed |

**Card-only fields (shown when itemType = `card`):**

| Field | Type | Notes |
|---|---|---|
| `masterCard` | relationship → master-card-list | |
| `printing` | select | same options as CustomerCollections |
| `language` | select | same options as CustomerCollections |
| `gradingCompany` | select | PSA, BGS, CGC, SGC, ACE, Other, None |
| `gradeValue` | text | e.g. "9.5", "10" |
| `sourceCollectionEntry` | relationship → customer-collections | nullable, set when auto-synced |

**Product-only fields (shown when itemType = `product`):**

| Field | Type | Notes |
|---|---|---|
| `title` | text | product name, e.g. "Prismatic Evolutions Booster Box" |
| `description` | rich text | |
| `productType` | relationship → product-types | |
| `productCategory` | relationship → product-categories | |
| `variants` | array block | see 1.3 |

### 1.3 — Variants

Variants live as an array block inside each Inventory item. Used for sealed/accessory products (not single cards).

Each variant:

| Field | Type | Notes |
|---|---|---|
| `label` | text | e.g. "Japanese / Near Mint", "Black" |
| `attributes` | array of `{ key, value }` | e.g. `{ language: Japanese }`, `{ colour: Black }` |
| `stockQty` | number | |
| `priceAdjustment` | number (GBP) | +/- from base item price |
| `sku` | text | auto-generated per variant |

### 1.4 — `inventoryStatus` field on CustomerCollections

Add an `inventoryStatus` field to the `CustomerCollections` collection:

- `select` with options: `not_for_sale`, `draft`, `for_sale`
- Default: `not_for_sale`
- **Conditional display**: only shown in the UI when the authenticated customer has `storeEnabled = true`
- Shown in the add-to-collection modal/form alongside condition, printing, language etc.

This gives the seller control at the point of adding the card — no separate admin step needed for cards they actively want to list.

### 1.5 — Collection → Inventory Hook

`afterChange` hook on `CustomerCollections`. Fires on creation only.

Logic:
1. Read `inventoryStatus` from the new collection entry
2. If `inventoryStatus = not_for_sale`, do nothing
3. If `inventoryStatus = draft` or `for_sale`, create an `Inventory` record with:
   - `itemType: card`
   - `status` set to match `inventoryStatus` (`draft` or `for_sale`)
   - `pricingMode: auto`
   - `masterCard`, `condition`, `printing`, `language`, `gradingCompany`, `gradeValue` inherited from the collection entry
   - `sourceCollectionEntry` set to the new collection entry ID
   - `stockQty: 1`
   - SKU auto-generated

No `storeEnabled` check needed in the hook — the field only appears in the UI for enabled accounts, so `not_for_sale` is always the default for non-store users.

### 1.6 — Auto-Price Hook

`beforeChange` hook on `Inventory`.

Logic:
- If `itemType = card` and `pricingMode = auto` and `masterCard` is set
- Look up `CatalogCardPricing` by `masterCard`
- Populate `autoPrice` from the relevant printing price (holofoil or normal)
- If no pricing data found, leave `autoPrice` null and log a warning in `notes`

The effective price used at checkout = `manualPrice` if `pricingMode = manual`, else `autoPrice`.

### 1.7 — New Payload Collection: `StockTransactions`

Append-only audit log of every stock movement. `stockQty` on `Inventory` remains the source of truth for reads — transactions are the receipt, not the ledger. Both are always written together.

| Field | Type | Notes |
|---|---|---|
| `inventoryItem` | relationship → inventory | required |
| `type` | select | `initial`, `sold`, `returned`, `manual_adjustment`, `reserved`, `released` |
| `qty` | number | positive = stock added, negative = stock removed |
| `order` | relationship → orders | nullable, set for `sold` and `returned` types |
| `note` | textarea | required for `manual_adjustment`, optional otherwise |
| `createdBy` | relationship → users | Payload admin user who triggered it, if manual |
| `createdAt` | timestamp | auto-set, never editable |

**Rules:**
- Records are never edited or deleted — admin corrections are a new `manual_adjustment` row
- Written automatically by hooks whenever `stockQty` changes on `Inventory`
- Admin can view the full transaction history for any item in Payload

### 1.8 — SKU Generation

Auto-generated in a `beforeChange` hook on `Inventory`:
- Cards: `CARD-XXXXX` (zero-padded 5-digit sequential number)
- Products: `PROD-XXXXX`
- Variants: `{parentSku}-V{n}` (e.g. `PROD-00012-V1`)

---

## Phase 2 — Postage

### 2.1 — New Payload Collection: `PostageTiers`

Admin-managed flat-rate shipping options. You define 2–3 tiers; the customer picks one at checkout.

| Field | Type | Notes |
|---|---|---|
| `name` | text | e.g. "Standard Letter", "Tracked 48", "Tracked 24" |
| `description` | text | shown to customer at checkout, e.g. "3–5 working days" |
| `price` | number (GBP) | flat rate |
| `carrier` | text | e.g. "Royal Mail" |
| `isActive` | checkbox | deactivate without deleting |
| `sortOrder` | number | controls display order at checkout |

No weight fields, no basket weight calculation. Customer simply selects from the available active tiers. Tiers are managed entirely in Payload admin — no code change needed to add, remove, or reprice a tier.

---

## Phase 3 — Customer-Facing Shop

### 3.1 — Public Inventory API

`GET /api/shop/inventory` — public, no auth required.

Returns `for_sale` inventory items with: effective price, condition, stock qty, variant data, card images (from MasterCardList for cards, from Inventory images for products).

Query params:
- `type` — `card` or `product`
- `setCode`, `condition`, `printing`, `language`
- `priceMin`, `priceMax`
- `productCategory`, `productType`
- `search` — text search on card name or product title
- `page`, `limit` — pagination

`GET /api/shop/inventory/[id]` — single item detail.

`GET /api/shop/postage` — returns all active PostageTiers.

### 3.2 — Shop UI Routes

All within `/app/(app)/shop/`, using the existing app layout.

| Route | Purpose |
|---|---|
| `/shop` | Landing: featured listings, category tiles, new arrivals |
| `/shop/cards` | Card listings with filters (set, condition, printing, language, price) |
| `/shop/products` | Sealed + accessories with filters (category, type, condition, price) |
| `/shop/[inventoryId]` | Item detail: images, condition, price, variant picker, add to basket |
| `/shop/basket` | Basket review, postage tier selection |
| `/shop/checkout` | Shipping address entry, order summary, proceed to Stripe |
| `/shop/checkout/success` | Post-payment confirmation page |

Reuse existing `CardGrid` and filter component patterns where applicable.

### 3.3 — Basket

- Client-side state using Zustand (or React context), persisted to `localStorage`
- On checkout, basket is validated server-side against live stock before Stripe session is created
- No basket persistence in DB at this stage
- Basket items store: `inventoryId`, `variantLabel` (if applicable), `qty`, `priceAtAdd`, `title`, `imageUrl`

### 3.4 — New Payload Collection: `Orders`

| Field | Type | Notes |
|---|---|---|
| `customer` | relationship → customers | required (logged-in only for now) |
| `email` | text | denormalised |
| `status` | select | `pending_payment`, `paid`, `processing`, `shipped`, `delivered`, `cancelled` |
| `items` | array | `{ inventoryItem, variantLabel, qty, priceAtPurchase, title, imageUrl }` |
| `postageTier` | relationship → postage-tiers | |
| `postagePrice` | number (GBP) | denormalised at time of order |
| `subtotal` | number (GBP) | |
| `total` | number (GBP) | subtotal + postagePrice |
| `shippingAddress` | group | `{ name, line1, line2, city, postcode, country }` |
| `stripeCheckoutSessionId` | text | |
| `stripePaymentIntentId` | text | for reconciliation |
| `trackingNumber` | text | set by admin on dispatch |
| `trackingCarrier` | text | |
| `notes` | textarea | admin-only |
| `createdAt` / `updatedAt` | timestamps | |

### 3.5 — Checkout Flow

1. Customer reviews basket at `/shop/basket`, selects postage tier
2. Customer enters shipping address at `/shop/checkout`
3. `POST /api/shop/checkout`:
   - Validates each basket item against live `stockQty`
   - Creates `Order` with `status: pending_payment`
   - Creates Stripe Checkout Session with line items (products + postage)
   - Returns Stripe session URL
4. Customer redirected to Stripe hosted checkout
5. On return to `/shop/checkout/success?session_id=...`, UI polls order status and confirms

Stock is **not decremented** until Stripe webhook confirms payment (Phase 4).

---

## Phase 4 — Stripe Integration

### 4.1 — Setup

- Install `stripe` npm package
- Add env vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- No Payload plugin — direct Stripe SDK usage

### 4.2 — Webhook Handler

`POST /api/webhooks/stripe`

Events handled:

| Event | Action |
|---|---|
| `checkout.session.completed` | Mark Order `paid`, decrement `stockQty` on each Inventory item/variant, write `sold` StockTransaction per item, set item `status: sold` if qty reaches 0, send confirmation email |
| `checkout.session.expired` | Mark Order `cancelled`, restore `stockQty`, write `released` StockTransaction per item |
| `payment_intent.payment_failed` | Mark Order `cancelled`, restore `stockQty`, write `released` StockTransaction per item |
| `charge.refunded` | (Phase 6) Increment `stockQty`, write `returned` StockTransaction linked to Order |

Stripe webhook signature verified on every request using `STRIPE_WEBHOOK_SECRET`.

### 4.3 — Stock Handling Between Basket and Payment

**Approach: decrement on session creation, restore on failure/expiry.**

- When Stripe session is created: decrement `stockQty` + write `reserved` StockTransaction per item
- If `checkout.session.expired`: restore `stockQty` + write `released` StockTransaction, mark Order `cancelled`
- If payment fails: restore `stockQty` + write `released` StockTransaction, mark Order `cancelled`
- If payment succeeds: write `sold` StockTransaction (the `reserved` + `sold` pair gives full traceability)

Every stock movement has a corresponding transaction row — if `stockQty` ever looks wrong, the transaction log shows exactly what happened and when.

---

## Phase 5 — Admin Order Management

Handled entirely within Payload admin UI — no custom admin pages needed at launch.

### Admin capabilities via Payload:
- **Orders list** — filterable by status, customer, date range
- **Order detail** — update status, add tracking number/carrier, internal notes
- **Inventory list** — manage stock, flip `draft` → `for_sale`, edit prices, manage variants
- **PostageTiers** — CRUD for shipping bands
- **Customers** — set `storeEnabled` flag per account

### Future: transactional emails

Add `afterChange` hook on `Orders` to send emails on status transitions:
- `pending_payment` → `paid`: order confirmation to customer
- `processing` → `shipped`: dispatch notification with tracking

Email provider TBD (Resend recommended — simple API, good Next.js support, free tier).

---

## Phase 6 — Customer Order History

- `GET /api/account/orders` — returns orders for the authenticated customer (requires Supabase auth)
- New page `/account/orders` — order list with status badges, item summaries, totals
- New page `/account/orders/[orderId]` — order detail with line items, shipping address, tracking info when available
- Reachable from existing account/profile area

---

## Data Flow

```
Customer adds card to collection
  └─ UI shows inventoryStatus field if customer.storeEnabled
       └─ Customer selects: not_for_sale | draft | for_sale
            └─ CustomerCollections afterChange hook
                 └─ if inventoryStatus != not_for_sale
                      └─ create Inventory { status: inventoryStatus, pricingMode: auto }
                           └─ beforeChange hook → populate autoPrice from CatalogCardPricing

Admin opens Payload → reviews drafts → flips status to for_sale if needed

Customer browses /shop → adds items to basket (localStorage)
  └─ POST /api/shop/checkout
       └─ validate stock
            └─ decrement stockQty + write reserved StockTransaction per item
                 └─ create Order { status: pending_payment }
                      └─ create Stripe Checkout Session
                           └─ redirect to Stripe

Stripe session expires / payment fails
  └─ POST /api/webhooks/stripe
       └─ restore stockQty + write released StockTransaction per item
            └─ Order → cancelled

Customer pays
  └─ POST /api/webhooks/stripe (checkout.session.completed)
       └─ Order → paid
            └─ write sold StockTransaction per item
                 └─ items at qty 0 → status: sold
                      └─ send confirmation email (Phase 5)

Customer views order history at /account/orders (Phase 6)
```

---

## Build Order

| Phase | Scope | Depends On |
|---|---|---|
| 1 | Inventory collection, StockTransactions collection, storeEnabled flag, collection hook, auto-price hook, SKU generation | — |
| 2 | PostageTiers collection, weight fields | Phase 1 |
| 3 | Shop UI, basket, Orders collection, checkout API (mock Stripe) | Phase 1, 2 |
| 4 | Stripe integration, webhook handler, stock decrement | Phase 3 |
| 5 | Admin order management polish, transactional emails | Phase 3 |
| 6 | Customer order history pages | Phase 4 |

---

## Decisions Made

| Decision | Choice |
|---|---|
| SKU format | Auto-generated: `CARD-XXXXX`, `PROD-XXXXX`, `{parent}-V{n}` for variants |
| "Sealed" condition | Already exists in ItemConditions — no change needed |
| Card images in shop | Use existing MasterCardList images; Inventory-level image uploads for graded/sealed/products |
| Authentication at checkout | Logged-in accounts only at launch |
| Email provider | TBD — Resend recommended |
| Stock reservation | Decrement on session creation, restore on failure/expiry. All movements logged to StockTransactions |
| Multiple admin accounts | All team members get Payload Users accounts with equal admin permissions |

---

## Open Questions

- Email provider: Resend, Postmark, or other?
- Do you want a "featured" or "pinned" flag on Inventory items for the shop landing page?
