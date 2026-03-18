# TCG — Build Plan (Phased)

## Goal
Build a simple, scalable Pokémon TCG ecommerce + inventory management system.

## Tech Stack
- Next.js 14 (App Router)
- Payload CMS 3
- Supabase (PostgreSQL)
- Tailwind CSS
- TypeScript
- Stripe (Phase 8)

## Principles
- Keep it simple
- Manual first, automate later
- Avoid overengineering
- Build for v1 — don't solve v2 problems yet

---

# Phase 1 — Foundation
**Goal:** Get the project running locally with a working admin panel.

- Create Next.js 14 app with TypeScript and Tailwind
- Set up folder structure for Payload compatibility (app/(app)/ route group)
- Install and configure Payload CMS 3
- Connect to Supabase (PostgreSQL) via DATABASE_URI
- Create Users collection with auth
- Confirm admin panel loads at /admin

---

# Phase 2 — Core Types + Site Settings
**Goal:** Build all the reference/lookup data that everything else depends on.

- Brands collection
- Sets collection (linked to Brands)
- Product Types collection
- Product Categories collection (with parent/child support)
- Item Conditions collection
- Site Settings (global — store name, logo, contact info, GBP currency default)

---

# Phase 3 — Master Card List
**Goal:** Store a local copy of Pokémon card data so we're not dependent on external APIs.

- Master Card List collection (see database.md for full fields)
- Seed script that fetches from the Pokémon TCG API (https://pokemontcg.io/) and writes to Supabase
- Cards linked to Brands and Sets
- Admin can view, search and filter cards

---

# Phase 4 — Products & Inventory
**Goal:** Be able to add stock and see what we have.

- SKU Items collection (the product listing)
- Inventory collection (the actual stock record per SKU + condition)
- inventoryMode field present but only quantity mode built for v1
- Opening stock entry: manual one-time entry of quantityOnHand per inventory record
- Grading fields on Inventory: gradingCompany and gradeValue (for PSA/BGS slabs)
- No quantityReserved or quantityAvailable yet — just quantityOnHand

---

# Phase 5 — Basic Frontend
**Goal:** See products on screen. Doesn't need to be pretty yet.

- Product listing page — shows all published SKU items
- Product detail page — shows full product info
- Fetch data from Payload REST or Local API
- Basic layout with header and footer using Site Settings data

---

# Phase 6 — Transactions
**Goal:** Be able to record a sale or purchase manually through the admin.

- Transactions collection
- Transaction Items collection
- Manual workflow: create a transaction, add items, set status
- Contact field on transaction (optional for v1 — can be left blank)
- Currency defaults to GBP

---

# Phase 7 — Inventory Movements
**Goal:** Stock levels change automatically when transactions happen.

- Inventory Movements collection (full audit log)
- Movement auto-created when a transaction is completed
- quantityOnHand on Inventory record updated automatically
- Opening stock entry also creates an adjustment_in movement
- movementType: purchase | sale | trade_in | trade_out | refund_in | refund_out | adjustment_in | adjustment_out

---

# Phase 8 — Checkout + Stripe
**Goal:** Customers can buy from the website.

- Shopping cart (client-side state)
- Checkout flow
- Stripe integration for payments
- On successful payment: create Transaction + Transaction Items + trigger inventory movement
- Order confirmation page

---

# Phase 9 — Contacts
**Goal:** Track who is buying from you.

- Contacts collection
- Contact Addresses collection
- Link contacts to transactions
- Basic contact view in admin

---

# Phase 10 — Admin Improvements
**Goal:** Make the admin panel easier to use day-to-day.

- Improve SKU Item creation flow
- Better transaction views
- Bulk stock actions
- Search and filter improvements

---

# Phase 11 — Order Management
**Goal:** Manage fulfilment after a sale.

- Order status updates (draft | pending | completed | cancelled)
- Fulfilment status tracking
- Tracking number field
- Basic order list view in admin

---

# Phase 12 — Content + SEO
**Goal:** Make the site feel like a real store.

- Pages collection (about, FAQ, returns policy etc.)
- SEO fields on products and pages
- Announcement bar
- Homepage content fields

---

# Phase 13 — Launch
**Goal:** Ship it.

- QA pass
- Performance check
- SEO review
- Deploy to Vercel
- Point domain
