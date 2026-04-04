-- Extends `customer_collections.printing` for TCGdex / Scrydex pricing variants.
-- Run each statement once in Supabase SQL editor (skip any that already exist).

ALTER TYPE enum_customer_collections_printing ADD VALUE 'Pokemon Day Stamp';
ALTER TYPE enum_customer_collections_printing ADD VALUE 'Pokemon Center Stamp';
ALTER TYPE enum_customer_collections_printing ADD VALUE 'Staff Stamp';
ALTER TYPE enum_customer_collections_printing ADD VALUE 'First Edition Holo';
ALTER TYPE enum_customer_collections_printing ADD VALUE 'Unlimited';
ALTER TYPE enum_customer_collections_printing ADD VALUE 'Unlimited Holo';
