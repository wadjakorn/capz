# OCR Overlay — Visible Fitted Text + Progress Feedback (refinement)

**Date:** 2026-06-21
**Status:** Approved (design).
**Area:** Editor OCR overlay (`src/components/editor/OcrLayer.tsx`, `src/lib/ocr.ts`, `src/stores/ocr.ts`, `src/components/editor/Toolbar.tsx`)
**Builds on:** [2026-06-19-ocr-text-reader-design.md](2026-06-19-ocr-text-reader-design.md)

## Problem (from smoke test)

1. **Highlight misaligns with the image text.** The current overlay renders each word `<span>` transparent with `left/top/height/fontSize` from the OCR box but **no `width`**, so glyphs render at the system font's natural width — which differs from the image word's pixel width. The browser's selection highlight follows the span's own glyph geometry and drifts off the underlying image text, so the user can't tell which text they're selecting. `fontSize = box.h` also over-sizes glyphs (cap-height ≠ full box height).
2. **No detection feedback.** While `ocr_detect` runs there is no spinner/loader, and nothing signals completion. The toolbar's label-only change ("Detecting text…") is not noticeable.

## Decisions (locked with user)

- **Render the OCR text VISIBLE on top of the image**, each unit fitted to its exact pixel box, on a **translucent-white backing per unit** (covers the original glyphs → no double-text, readable over any image). Selection = what you see.
- Overlay shows only while OCR mode is on; toggling off restores the pristine image (unchanged).
- **Feedback:** toolbar button shows a spinner while scanning; a toast reports the result on finish.

## 1. Overlay rewrite (`OcrLayer.tsx`)

Per unit (word where Vision provides word boxes, else the line — same unit model as today):
- Positioned chip at the box: `left = box.x*scale`, `top = box.y*scale`, `width = box.w*scale`, `height = box.h*scale`.
- **Backing:** `background: rgba(255,255,255,0.7)` (tunable), slight border radius.
- **Visible text:** near-black (e.g. `#0b0b0b`), vertically centered, `fontSize` derived from box height, horizontally scaled via `transform: scaleX(fitX)` (`transform-origin: left center`) so the rendered text exactly fills `box.w`.
- The chip contains the real recognized text (now visible), so native selection + copy work and the highlight lands on the visible glyphs. Copy spacing preserved: a separating space between words, newline at line end.
- `data-ocr-layer` attribute and the `mode && currentResult` mount guard are unchanged (context-menu bail + draw-suspend still work).
- Font stack must cover Latin + Thai (bundled NotoSansThai → `system-ui` fallback).

## 2. Fit math (`src/lib/ocr.ts`)

Pure helper:
```
computeFitScaleX(text: string, fontPx: number, boxW: number, measure: (text, fontPx) => number): number
```
- Returns `boxW / measure(text, fontPx)`, clamped to `[0.1, 10]` so OCR-noise boxes don't produce extreme stretches.
- **Graceful fallback:** if `measure` returns `0`, `NaN`, or non-finite, return `1` (no stretch). This keeps it working where canvas text metrics are unavailable (e.g. jsdom) and makes the function unit-testable with an injected fake measurer.
- Measurement is done in **image-pixel space** (using `box.w` and a `fontPx` proportional to `box.h` in image px) so `fitX` is zoom-invariant; only the rendered `fontSize` re-multiplies by `displayScale`. The component measures via a shared offscreen `canvas` 2D context (`ctx.font = \`${fontPx}px ${fontStack}\`; ctx.measureText(text).width`), guarded so a missing canvas → fallback.

Keep existing `ocrBoxStyle` (still used for left/top/width/height).

## 3. Progress feedback

- **Button spinner (`Toolbar.tsx`):** when `ocrStatus === "scanning"`, render a spinning `Loader2` (`animate-spin`) in place of the `ScanText` icon. Button stays disabled while scanning (already wired).
- **Finish toast (`useOcr.detect()`):** on success, `toast.success` with the line count when `lines.length > 0` (e.g. `Detected N text lines`), else `toast("No text found")`. The error path already toasts; the once-per-session Thai-unavailable notice is unchanged (both may fire — acceptable).

## 4. Files

- **Edit:** `src/components/editor/OcrLayer.tsx` (visible fitted chips + backing + measurement), `src/lib/ocr.ts` (`computeFitScaleX`), `src/stores/ocr.ts` (finish toast), `src/components/editor/Toolbar.tsx` (spinner icon).

## 5. Testing

- **Unit (`src/lib/ocr.test.ts`):** `computeFitScaleX` — ratio (`boxW/measured`), clamp to `[0.1,10]`, and `0`/`NaN`/non-finite measure → `1`.
- **Unit (`src/stores/ocr.test.ts`):** `detect()` finish toast fires once on success (count branch) and the no-text branch (`lines: []`) shows "No text found". Keep existing idempotency/reset/Thai tests green.
- **e2e (`e2e/web/ocr.spec.ts`):** still asserts `[data-ocr-layer]` contains the recognized text (now visible) and the idempotent re-toggle; adjust only if the visible-text change breaks a selector.

## 6. Risks / notes

- Re-typed text uses a web font → not pixel-identical to the screenshot's font; acceptable (transient, only while OCR on, white backing reads as a clean text layer).
- Clamp `fitX` to avoid wild stretching on degenerate boxes.
- Measurement perf: compute per unit once per result (memoized), not per zoom.
- Dark images: white backing guarantees contrast for the near-black text.
