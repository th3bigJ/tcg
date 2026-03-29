# Scanner Fix Documentation

## Original Issue
User reported a zoomed-in view showing only a black ring (card guide frame shadow) when accessing the scan page at `/scan`.

**Screenshot showed:** Large black circular ring filling the screen - this was the `shadow-[0_0_0_999px_rgba(0,0,0,0.28)]` from the card guide frame, zoomed in.

## Root Cause
The camera video element used `object-cover` CSS which crops the video to fill the container, combined with browser zoom or viewport scaling issues.

## Final Fixes Applied

### 1. Camera Zoom & Guide Alignment
**File:** `components/OnnxScanLab.tsx`
- **Change:** Reverted camera `video` element to `object-cover`.
- **Reason:** The `readGuideCrop` logic in `lib/onnxCardDetector.ts` expects a full-bleed video feed where the center of the feed corresponds to the center of the UI.
- **Alignment:** Adjusted the `GUIDE` constants (`top: 0.08`, `bottom: 0.92`) to perfectly match the visual white guide box. This ensures that the area captured for OCR is exactly what the user sees inside the box.

### 2. Preview Scaling
**File:** `components/OnnxScanLab.tsx`
- **Change:** Set `PreviewCard` (OCR strips and unwarped results) to `object-contain`.
- **Reason:** Prevents any secondary "zoom" or cropping on the result images.

### 3. Interactive Results
**File:** `components/OnnxScanLab.tsx`
- **Change:** Replaced static candidate links with the standard `CardGrid` component.
- **Benefit:** Clicking a result now opens the standard card detail modal with pricing, hi-res images, and collection management (if logged in).

### 4. Supabase Runtime Fix
**File:** `next.config.ts`
- **Change:** Added `@supabase/ssr` and `@supabase/supabase-js` to `transpilePackages`.
- **Reason:** Fixed a `Cannot find module './vendor-chunks/@supabase.js'` runtime error that was breaking the scanner results and the Pokedex/Sets pages in Next.js 16 (Webpack).

## Status
- [x] Camera feed not zoomed
- [x] Guide box accurately captures the card
- [x] Results are interactive (clickable to modal)
- [x] App routing (Pokedex/Sets) restored
