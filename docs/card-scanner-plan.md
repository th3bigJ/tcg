# Card Scanner — Phased Build Plan

Scan a Pokemon card with your phone camera → extract text via OCR → match against the card DB → show card details and pricing.

---

## Overview

**Approach:** Browser Shape Detection API (`TextDetector`) with Tesseract.js as a fallback.
**Cost:** Free. No external API calls. Runs in-browser or on your server using existing infrastructure.
**New dependency:** `tesseract.js` (loaded lazily, only when `TextDetector` is unavailable).

---

## Phase 1 — OCR Utility

**Goal:** Extract card name and card number from a photo. No UI yet — just a testable function.

### Steps

- [ ] Install Tesseract.js
  ```bash
  npm install tesseract.js
  ```

- [ ] Create `lib/scanOcr.ts`
  - Export type:
    ```ts
    export type OcrResult = {
      cardName: string;
      cardNumber: string; // e.g. "062/091" or "SWSH001/198" — empty string if not found
      rawText: string;    // full OCR dump for debugging
    }
    ```
  - Export function: `extractCardTextFromImage(file: File): Promise<OcrResult>`
  - **Strategy:**
    1. Try `window.TextDetector` (Chrome Android/desktop, iOS Safari 16+)
       - `createImageBitmap(file)` → `new TextDetector().detect(bitmap)`
       - Join all detected text blocks into a single string
    2. If `TextDetector` not available, lazy-import Tesseract:
       ```ts
       const { createWorker } = await import('tesseract.js')
       ```
       - Create worker with `eng` language
       - `worker.recognize(file)` → read `data.text`
       - Terminate worker after use
  - **Parsing the raw text string:**
    - Card number: match `/\b([A-Z0-9]{1,6})\/(\d{2,3})\b/` — take first match
    - Card name: strip card number, HP pattern `/HP\s*\d+/i`, single energy-type characters; take the first non-empty line with length > 2 that is not a number
    - Trim and collapse whitespace on both outputs
  - Use dynamic import for Tesseract (`await import('tesseract.js')`) — never a top-level import — to prevent it entering the SSR bundle

- [ ] Smoke test manually
  - Temporarily import in a page or API route, pass a test image, log the result
  - Confirm card number regex captures `062/091`, `TG01/TG30`, `SWSH001/198`

---

## Phase 2 — Identify API Route

**Goal:** Accept extracted text, query the card DB, return ranked candidates.

### Steps

- [ ] Create `app/api/scan/identify/route.ts`
  - Method: `POST`
  - Request body:
    ```ts
    { cardName: string; cardNumber: string }
    ```
  - Response:
    ```ts
    {
      candidates: CardsPageCardEntry[];
      confidence: "high" | "low";
    }
    ```
  - **Query strategy (run in order, stop when results found):**

    **Stage 1 — Exact number + name (highest precision):**
    If `cardNumber` is non-empty, query:
    ```ts
    {
      and: [
        { cardNumber: { equals: cardNumber } },
        { cardName: { contains: cardNameFragment } },
        { imageLow: { exists: true } },
      ]
    }
    ```
    Limit 5.

    **Stage 2 — Name only:**
    Use existing `buildMasterCardsWhere` from `lib/cardsPageQueries.ts` with the extracted name.
    Limit 8.

    **Stage 3 — Tokenized fallback:**
    Split the raw name on whitespace. For each token with length > 3, run a `cardName: { contains: token }` query. Merge and deduplicate results by `id`. Limit 8 total.

  - Map raw Payload docs to `CardsPageCardEntry` using existing `masterCardDocToCardsPageEntry` from `lib/cardsPageQueries.ts`
  - **Confidence logic:**
    ```ts
    const topMatch = candidates[0];
    const confidence =
      cardNumber !== "" && topMatch?.cardNumber === cardNumber
        ? "high"
        : "low";
    ```
  - Sanitise inputs: trim both fields, max 100 chars each, return 400 if both are empty

- [ ] Test with curl before building any UI:
  ```bash
  curl -X POST http://localhost:3000/api/scan/identify \
    -H "Content-Type: application/json" \
    -d '{"cardName":"Charizard ex","cardNumber":"062/091"}'
  ```
  Confirm candidates array returns with image URLs, set info, rarity.

---

## Phase 3 — Scan Hook

**Goal:** Wire OCR + API into a React state machine hook.

### Steps

- [ ] Create `lib/hooks/useCardScan.ts`
  - State union type:
    ```ts
    type ScanState =
      | { status: "idle" }
      | { status: "processing"; preview: string }
      | { status: "searching"; preview: string; ocrResult: OcrResult }
      | { status: "results"; preview: string; ocrResult: OcrResult; candidates: CardsPageCardEntry[]; confidence: "high" | "low" }
      | { status: "error"; preview: string; message: string }
    ```
  - Export:
    ```ts
    export function useCardScan(): {
      state: ScanState;
      handleFile: (file: File) => Promise<void>;
      reset: () => void;
    }
    ```
  - `handleFile` flow:
    1. `URL.createObjectURL(file)` → set state `processing` with preview URL
    2. Call `extractCardTextFromImage(file)` from `lib/scanOcr.ts`
    3. Set state `searching` — user sees what text was extracted before search runs
    4. `POST /api/scan/identify` with `{ cardName, cardNumber }`
    5. Set state `results` or `error`
  - `reset()`: revoke the object URL (`URL.revokeObjectURL`), set state back to `idle`
  - Wrap in try/catch — on any failure set `error` state with a human-readable message

---

## Phase 4 — UI Components

**Goal:** Build the visual layer. No new patterns — follow existing component style.

### Steps

- [ ] Create `components/ScanUploadZone.tsx` (`"use client"`)
  - Props: `{ onFile: (file: File) => void; disabled: boolean }`
  - Two buttons (side by side on mobile):
    - **"Take photo"** — hidden `<input type="file" accept="image/*" capture="environment" />`
    - **"Upload from library"** — hidden `<input type="file" accept="image/*" />` (no capture)
  - Show a card-shaped placeholder (2:3 aspect ratio) before a file is selected
  - Show image preview once file is selected (use the `preview` URL from hook state)

- [ ] Create `components/ScanStatusBar.tsx` (`"use client"`)
  - Props: `{ state: ScanState }`
  - Renders overlaid on the preview image:
    - `processing`: spinner + "Reading card text..."
    - `searching`: "Searching for **[ocrResult.cardName]** [ocrResult.cardNumber]..." — showing the extracted text here is important so users understand low-confidence misses
    - `error`: error message + "Try again"
  - Nothing rendered in `idle` or `results` state

- [ ] Create `components/ScanResultsList.tsx` (`"use client"`)
  - Props: `{ candidates: CardsPageCardEntry[]; confidence: "high" | "low"; customerLoggedIn: boolean }`
  - If `confidence === "high"` and single candidate: prominent single-card layout
  - Otherwise: "Did you mean one of these?" heading + render candidates via existing `CardGrid` component
  - Pricing: call `GET /api/card-pricing/by-master/[masterCardId]` client-side for each candidate (or top candidate only for high confidence), same pattern as used in `SearchCardGrid.tsx`
  - Pass empty `wishlistEntryIdsByMasterCardId` and `collectionEntriesByMasterCardId` for unauthenticated; fetch if `customerLoggedIn`

- [ ] Create `components/ScanPage.tsx` (`"use client"`)
  - Props: `{ customerLoggedIn: boolean }`
  - Composes `useCardScan`, `ScanUploadZone`, `ScanStatusBar`, `ScanResultsList`
  - Layout: scrollable, mobile-first, no fixed-height constraints (unlike search page)
  - Show `ScanUploadZone` when `idle` or `error`
  - Show preview + `ScanStatusBar` when `processing` or `searching`
  - Show preview + `ScanResultsList` when `results`
  - "Scan another" / reset button shown after results

---

## Phase 5 — Page Route & Navigation

**Goal:** Wire everything into the app and make it discoverable.

### Steps

- [ ] Create `app/(app)/scan/page.tsx`
  - Server Component
  - Export `export const dynamic = "force-dynamic"`
  - Call `getCurrentCustomer()` (same as search page) to get auth state
  - Render `<ScanPage customerLoggedIn={!!customer} />`
  - Add page metadata: `export const metadata = { title: "Scan Card" }`

- [ ] Update `components/BottomNav.tsx`
  - Find the Search tab match condition
  - Add `|| p.startsWith("/scan")` so the Search tab highlights when on `/scan`
  - Alternatively add a dedicated Scan tab with a camera icon if the nav has room

- [ ] Verify the route works at `http://localhost:3000/scan` on mobile (use browser devtools device emulation)

---

## Phase 6 — Polish & Edge Cases

**Goal:** Handle the failure modes before calling it done.

### Steps

- [ ] **Low OCR confidence UX:** If `ocrResult.cardName` is very short (< 3 chars) and `cardNumber` is empty, skip the API call and show "Couldn't read the card — try better lighting or hold the card flat"

- [ ] **No results state:** If `candidates` is empty, show "No match found" with a manual search link to `/search?q=[ocrResult.cardName]` so the user isn't stuck

- [ ] **Tesseract loading state:** On first use, Tesseract downloads ~4MB of WASM + language data. Show "Loading text recognition..." during this — add a `loading` sub-state to `processing` if needed

- [ ] **Foil card note:** Add a small tip near the upload zone: "Works best in good lighting. Hold the card flat to reduce glare."

- [ ] **Test on real device:** Use `next dev --hostname 0.0.0.0` and access from phone on the same network. Test with:
  - A well-lit card face-on (should get high confidence)
  - A holographic/ex card (OCR noise test)
  - A card at a slight angle
  - A card with a non-numeric card number (e.g. `TG01/TG30`)

---

## Integration Reference

These existing files are used as-is — no changes needed:

| File | Used by |
|---|---|
| `lib/cardsPageQueries.ts` | `app/api/scan/identify/route.ts` — imports `buildMasterCardsWhere`, `masterCardDocToCardsPageEntry` |
| `components/CardGrid.tsx` | `ScanResultsList` — renders candidate cards |
| `app/api/card-pricing/by-master/[masterCardId]` | `ScanResultsList` — client-side pricing fetch |
| `lib/auth.ts` | `app/(app)/scan/page.tsx` — `getCurrentCustomer()` |

One change to existing code: `components/BottomNav.tsx` (Phase 5).

---

## File Checklist

```
lib/scanOcr.ts                              Phase 1
app/api/scan/identify/route.ts              Phase 2
lib/hooks/useCardScan.ts                    Phase 3
components/ScanUploadZone.tsx               Phase 4
components/ScanStatusBar.tsx                Phase 4
components/ScanResultsList.tsx              Phase 4
components/ScanPage.tsx                     Phase 4
app/(app)/scan/page.tsx                     Phase 5
components/BottomNav.tsx (edit)             Phase 5
```
