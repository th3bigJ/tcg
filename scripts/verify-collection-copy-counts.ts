/**
 * Run: npx tsx scripts/verify-collection-copy-counts.ts
 * Asserts merge + quantity helpers keep raw vs merged copy totals aligned.
 */
import {
  collectionCopyTotalsMatch,
  collectionGroupKeyFromEntry,
  mergeCollectionEntriesForGrid,
  type StorefrontCardEntry,
} from "../lib/storefrontCardMaps";

function baseEntry(overrides: Partial<StorefrontCardEntry> & { masterCardId: string }): StorefrontCardEntry {
  return {
    masterCardId: overrides.masterCardId,
    set: "sv1",
    filename: "test.png",
    lowSrc: "https://example.com/a.png",
    highSrc: "https://example.com/a.png",
    rarity: "Common",
    cardName: "Test",
    quantity: 1,
    ...overrides,
  } as StorefrontCardEntry;
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Two separate rows, same variant+condition → one tile, qty 2
{
  const mid = "card-a";
  const shared = {
    masterCardId: mid,
    printing: "Standard",
    conditionLabel: "Near Mint",
    language: "English",
  };
  const e1 = baseEntry({ ...shared, collectionEntryId: "1", quantity: 1 });
  const e2 = baseEntry({ ...shared, collectionEntryId: "2", quantity: 1 });
  assert(collectionGroupKeyFromEntry(e1) === collectionGroupKeyFromEntry(e2), "keys should match");
  const merged = mergeCollectionEntriesForGrid([e1, e2]);
  assert(merged.length === 1, "expect 1 tile");
  assert(merged[0]!.quantity === 2, "expect qty 2");
  assert(collectionCopyTotalsMatch([e1, e2], merged), "totals must match");
}

// Single row qty 2 → one tile qty 2
{
  const e = baseEntry({
    masterCardId: "card-b",
    collectionEntryId: "3",
    quantity: 2,
    printing: "Holo",
    conditionLabel: "Near Mint",
    language: "English",
  });
  const merged = mergeCollectionEntriesForGrid([e]);
  assert(merged.length === 1, "expect 1 tile");
  assert(merged[0]!.quantity === 2, "expect qty 2");
  assert(collectionCopyTotalsMatch([e], merged), "totals must match");
}

// Different printings → two tiles, 2 copies total
{
  const mid = "card-c";
  const e1 = baseEntry({
    masterCardId: mid,
    collectionEntryId: "4",
    quantity: 1,
    printing: "Standard",
    conditionLabel: "Near Mint",
    language: "English",
  });
  const e2 = baseEntry({
    masterCardId: mid,
    collectionEntryId: "5",
    quantity: 1,
    printing: "Holo",
    conditionLabel: "Near Mint",
    language: "English",
  });
  const merged = mergeCollectionEntriesForGrid([e1, e2]);
  assert(merged.length === 2, "expect 2 tiles");
  assert(collectionCopyTotalsMatch([e1, e2], merged), "totals must match");
}

console.log("ok: collection copy count invariants");
