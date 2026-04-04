/**
 * Manual / edit-sheet printing options in the UI. `customer_collections.printing` is stored as **plain text**
 * so pricing variants are not limited to this list.
 */
export const CUSTOMER_COLLECTION_PRINTING_BASE = [
  "Standard",
  "Reverse Holo",
  "Holo",
  "First Edition",
  "Shadowless",
  "other",
] as const;
