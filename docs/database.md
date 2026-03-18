# TCG — Database Structure (Payload CMS + Supabase)

## Overview
This project uses Payload CMS 3 with a Supabase (PostgreSQL) database.
All collections are defined as Payload collection configs in TypeScript.

## Default Currency
All price fields default to GBP (£).

## Groups Overview
- Auth
- Contacts
- Types
- Inventory
- Transactions
- Site Settings

---

# Auth

## Users
- name (text, required)
- email (email, required) — used for login
- password — handled by Payload auth
- Access: admin only

---

# Contacts

## Contacts
- type (select: individual | business)
- firstName (text)
- lastName (text)
- companyName (text)
- displayName (text — auto-generated or manual)
- email (email)
- phone (text)
- notes (textarea)
- tags (array of text)
- defaultBillingAddress (relationship → Contact Addresses)
- defaultShippingAddress (relationship → Contact Addresses)
- isActive (boolean, default: true)
- source (select: website | admin | manual | import)

## Contact Addresses
- contact (relationship → Contacts, required)
- label (select: home | work | billing | shipping | warehouse | other)
- firstName (text)
- lastName (text)
- companyName (text)
- phone (text)
- addressLine1 (text, required)
- addressLine2 (text)
- city (text, required)
- county (text)
- postcode (text, required)
- country (text, default: "United Kingdom")
- isDefaultBilling (boolean, default: false)
- isDefaultShipping (boolean, default: false)
- notes (textarea)

---

# Types

## Brands
- name (text, required, unique)
- slug (text, required, unique)
- description (textarea)
- logo (upload → Media)
- isActive (boolean, default: true)
- notes (textarea)

## Sets
- name (text, required)
- slug (text, required, unique)
- code (text — set id used by the card API / seeding, e.g. "swsh3" or "base1")
- brand (relationship → Brands, required)
- releaseDate (date)
- symbolImage (upload → Set Symbols Media)
- setImage (upload → Set Logos Media)
- cardCountTotal (number)
- cardCountOfficial (number)
- cardCountFirstEd (number)
- cardCountHolo (number)
- cardCountNormal (number)
- cardCountReverse (number)
- legalStandard (boolean)
- legalExpanded (boolean)
- serieId (text — TCGdex series id, e.g. "swsh")
- serieName (text — e.g. "Sword & Shield")
- isActive (boolean, default: true)
- notes (textarea)

## Product Types
Examples: Single Card, Sealed Booster Pack, Sealed Box, Graded Card, Bundle
- name (text, required, unique)
- slug (text, required, unique)
- description (textarea)
- isActive (boolean, default: true)
- notes (textarea)

## Product Categories
Examples: Scarlet & Violet, Sword & Shield, Vintage, Japanese
- name (text, required)
- slug (text, required, unique)
- parentCategory (relationship → Product Categories — self-referential, optional)
- description (textarea)
- isActive (boolean, default: true)
- notes (textarea)

## Item Conditions
Examples: Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged
- name (text, required, unique)
- slug (text, required, unique)
- description (textarea)
- sortOrder (number — controls display order)
- isActive (boolean, default: true)
- notes (textarea)

## Master Card List
Used for single cards only. Seeded from the Pokémon TCG API (TCGdex).
Stored locally so we are not dependent on the external API being available.

- brand (relationship → Brands, required)
- set (relationship → Sets, required)
- cardName (text, required)
- cardNumber (text, required — e.g. "001/198")
- fullDisplayName (text — e.g. "Charizard ex 001/198 Scarlet & Violet Base")
- category (text — e.g. "Pokemon", "Trainer", "Energy")
- localId (text — set-local card index, e.g. "136")
- rarity (text — e.g. "Uncommon", "Double Rare")
- supertype (text — e.g. "Pokémon", "Trainer", "Energy")
- subtypes (array of text — e.g. ["Basic", "ex"])
- stage (text — e.g. "Basic", "Stage1")
- hp (number)
- elementTypes (array of text — e.g. ["Fire", "Colorless"])
- evolveFrom (text — name of previous stage, e.g. "Sentret")
- description (textarea — flavor text)
- artist (text)
- externalId (text — TCGdex card id, used for deduplication)
- image (upload → Media — stored locally)
- variants (group)
  - firstEdition (boolean)
  - holo (boolean)
  - normal (boolean)
  - reverse (boolean)
  - wPromo (boolean)
- attacks (array of group)
  - cost (array of text — energy cost, e.g. ["Colorless"])
  - name (text)
  - effect (text)
  - damage (text — e.g. "90" or "100+")
- weaknesses (array of group)
  - type (text — e.g. "Fighting")
  - value (text — e.g. "×2")
- retreat (number — retreat cost)
- regulationMark (text — e.g. "D")
- legal (group)
  - standard (boolean)
  - expanded (boolean)
- effect (textarea — card effect text for Trainer / Energy)
- trainerType (text — Trainer cards only, e.g. Item, Supporter)
- energyType (text — Energy cards only: Basic, Special)
- dexId (array of number — Pokémon National Dex ID(s))
- level (text — Pokémon level, e.g. LV.X)
- suffix (text — Pokémon card suffix/identifiers)
- item (group — Pokémon held item)
  - name (text)
  - effect (text)
- boosters (json — booster packs containing this card, or null)
- pricing (json — market pricing info when available)
- updated (date — ISO8601, last card data update from API)
- isActive (boolean, default: true)
- notes (textarea)

---

# Inventory

## SKU Items
A SKU Item is the product listing — what the customer sees and what you list for sale.
One SKU Item can have multiple Inventory records (e.g. same card in different conditions).

- title (text, required)
- slug (text, required, unique)
- skuCode (text, required, unique — e.g. "PKM-SVI-001-NM")
- brand (relationship → Brands)
- set (relationship → Sets)
- productType (relationship → Product Types, required)
- productCategory (relationship → Product Categories)
- masterCard (relationship → Master Card List, optional — only used for single cards)
- description (richText)
- images (array of upload → Media)
- isActive (boolean, default: true)
- isPublished (boolean, default: false)
- inventoryMode (select: quantity | unique, default: quantity)
  NOTE: Only quantity mode is built in v1. The field exists so we don't need a DB migration later.
- trackInventory (boolean, default: true)

### Pricing
- price (number, required — in GBP)
- compareAtPrice (number — original price if on sale)
- costPrice (number — what you paid for it)
- taxClass (select: standard | zero | exempt, default: standard)

### Logistics
- barcode (text)
- weight (number — in grams)
- dimensions (group)
  - length (number — mm)
  - width (number — mm)
  - height (number — mm)

### Metadata
- attributes (json — flexible key/value for anything not covered above)
- notes (textarea)

---

## Inventory
An Inventory record tracks the actual stock for a specific SKU Item in a specific condition.
Multiple inventory records can exist per SKU Item (e.g. NM, LP, MP versions of the same card).

- skuItem (relationship → SKU Items, required)
- condition (relationship → Item Conditions, required)
- language (select: English | Japanese | Korean | Chinese | German | French | Italian | Spanish | Portuguese, default: English)
- printing (select: Standard | Reverse Holo | Holo | First Edition | Shadowless | other, default: Standard)

### Stock
- quantityOnHand (number, default: 0)
  NOTE: quantityReserved and quantityAvailable are NOT in v1.
  They will be added in a later phase when checkout creates reservations.

### Grading (for graded cards — PSA, BGS, CGC etc.)
- gradingCompany (select: PSA | BGS | CGC | SGC | ACE | Other | none, default: none)
- gradeValue (text — e.g. "9", "9.5", "10" — text not number to support half grades and labels like "PSA A")

### Status
- status (select: active | sold_out | archived | damaged_hold, default: active)
- notes (textarea)
- lastUpdatedAt (date — auto-updated on change)

---

## Inventory Movements
A full audit log of every stock change. Auto-created by the system — never entered manually.
This is how we know the history of every item's stock level.

- skuItem (relationship → SKU Items, required)
- inventoryRecord (relationship → Inventory, required)
- transaction (relationship → Transactions — optional, set when movement is from a sale/purchase)
- transactionItem (relationship → Transaction Items — optional)
- movementType (select: purchase | sale | trade_in | trade_out | refund_in | refund_out | adjustment_in | adjustment_out)
- direction (select: inbound | outbound)
  - inbound = stock coming in (purchase, trade_in, refund_in, adjustment_in)
  - outbound = stock going out (sale, trade_out, refund_out, adjustment_out)
- quantity (number, required)
- unitCost (number — what it cost us)
- unitPrice (number — what we sold it for)
- estimatedUnitValue (number — market value at time of movement)
- skuCodeSnapshot (text — copy of SKU code at time of movement)
- titleSnapshot (text — copy of title at time of movement)
- conditionSnapshot (text — copy of condition name at time of movement)
- reason (text — e.g. "Opening stock entry", "eBay sale #12345")
- notes (textarea)
- createdBy (relationship → Users)
- createdAt (date — auto)

---

# Transactions

## Transactions
A Transaction records a sale, purchase, trade, or adjustment.
Can be created manually in the admin or automatically by the website checkout.

- transactionNumber (text, required, unique — auto-generated e.g. "TXN-00001")
- transactionType (select: sale | purchase | trade | refund | adjustment)
- status (select: draft | pending | completed | cancelled, default: draft)
- source (select: website | admin | in_person | facebook | ebay | trade_event | manual | other)
- currency (text, default: "GBP")

### Contact
- contact (relationship → Contacts — optional)
- contactSnapshotName (text — snapshot of name at time of transaction)
- contactSnapshotEmail (text)
- contactSnapshotPhone (text)
- contactSnapshotCompany (text)

### Addresses (snapshots — not live relationships, so address changes don't affect old orders)
- billingAddress (group)
  - firstName, lastName, companyName, addressLine1, addressLine2, city, county, postcode, country
- shippingAddress (group)
  - firstName, lastName, companyName, addressLine1, addressLine2, city, county, postcode, country

### Financials (all in GBP)
- subtotal (number)
- shippingAmount (number, default: 0)
- discountAmount (number, default: 0)
- taxAmount (number, default: 0)
- cashAdjustment (number, default: 0 — for rounding on cash payments)
- totalAmount (number)

### Payment
- paymentMethod (select: stripe | cash | bank_transfer | paypal | other)
- paymentStatus (select: unpaid | paid | partially_paid | refunded)

### Fulfilment
- fulfilmentStatus (select: unfulfilled | partially_fulfilled | fulfilled | cancelled)
- shippingMethod (text)
- trackingNumber (text)

### References
- stripePaymentIntentId (text — set automatically on Stripe payments)
- externalReference (text — eBay order number, Facebook ref, etc.)

### Notes
- notes (textarea — visible to customer)
- internalNotes (textarea — admin only)
- completedAt (date)

---

## Transaction Items
Each line item within a Transaction.

- transaction (relationship → Transactions, required)
- skuItem (relationship → SKU Items, required)
- inventoryRecord (relationship → Inventory, required)
- direction (select: inbound | outbound)
- condition (relationship → Item Conditions)
- quantity (number, required, default: 1)

### Snapshots (copied at time of transaction — never changes even if product is edited)
- titleSnapshot (text)
- skuCodeSnapshot (text)
- setNameSnapshot (text)
- productTypeSnapshot (text)
- conditionSnapshot (text)

### Pricing (in GBP)
- unitPrice (number)
- unitCost (number)
- estimatedUnitValue (number)
- lineDiscount (number, default: 0)
- lineTax (number, default: 0)
- lineTotal (number)

### Notes
- notes (textarea)

---

# Site Settings

## Site Settings (Global — single record, not a collection)
- storeName (text, default: "TCG")
- storeTagline (text)
- logo (upload → Media)
- contactEmail (email)
- contactPhone (text)
- businessName (text)
- businessAddress (group: addressLine1, addressLine2, city, county, postcode, country)
- currency (text, default: "GBP")
- socialLinks (array)
  - platform (select: instagram | facebook | twitter | tiktok | youtube | other)
  - url (text)
- freeShippingThreshold (number — order value in GBP above which shipping is free)
- defaultShippingPrice (number — in GBP)
- returnsPolicySummary (textarea)
- announcementBarText (text)
- homepageTitle (text)
- homepageIntro (richText)
- notes (textarea)

## Pages
- title (text, required)
- slug (text, required, unique)
- content (richText)
- seoTitle (text)
- seoDescription (textarea)
- isPublished (boolean, default: false)
- notes (textarea)
