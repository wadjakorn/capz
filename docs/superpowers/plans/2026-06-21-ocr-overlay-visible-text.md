# OCR Overlay Visible Text + Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the OCR overlay render the recognized text VISIBLE and fitted to each pixel box (on a translucent-white backing) so selection aligns with what the user sees, and add detection progress feedback (button spinner + finish toast).

**Architecture:** A pure `computeFitScaleX` helper computes a horizontal scale that fits each unit's text to its image-space box width (via injectable text measurement, with a no-canvas fallback). `OcrLayer` renders one positioned chip per unit — white translucent backing + near-black visible text fitted with `transform: scaleX`. `useOcr.detect()` emits a result toast; the toolbar button shows a spinner while scanning.

**Tech Stack:** Next.js 15, React 19, Zustand 5, sonner, lucide-react, Vitest, Tailwind.

## Global Constraints

- pnpm only.
- No localStorage/sessionStorage.
- Copy stays native (selection + right-click + ⌘C/Ctrl+C) — no custom text clipboard write.
- OCR boxes: top-left origin, image-pixel space; overlay maps box→screen by ×`displayScale`.
- Overlay stays pure DOM (excluded from exported PNG); keeps `data-ocr-layer` attribute and the `mode && currentResult` mount guard.
- Font stack must cover Latin + Thai.
- Builds on the existing OCR feature (branch `feat/ocr-text-reader`).

---

## File Structure
- **Edit** `src/lib/ocr.ts` — add `computeFitScaleX`.
- **Edit** `src/lib/ocr.test.ts` — tests for `computeFitScaleX`.
- **Rewrite** `src/components/editor/OcrLayer.tsx` — visible fitted chips + backing + measurer.
- **Edit** `src/stores/ocr.ts` — finish toast in `detect()`.
- **Edit** `src/stores/ocr.test.ts` — finish-toast tests + adjust the Thai-notice assertion.
- **Edit** `src/components/editor/toolbar/ToolButton.tsx` — optional `iconClassName`.
- **Edit** `src/components/editor/Toolbar.tsx` — spinner icon while scanning.

---

## Task 1: `computeFitScaleX` fit helper

**Files:** Modify `src/lib/ocr.ts`; Test `src/lib/ocr.test.ts`.

**Interfaces:**
- Produces: `export function computeFitScaleX(text: string, fontPx: number, boxW: number, measure: (text: string, fontPx: number) => number): number` — returns `boxW / measure(...)` clamped to `[0.1, 10]`; returns `1` when `measure` yields `0`, `NaN`, or non-finite.

- [ ] **Step 1: Write failing tests** — append to `src/lib/ocr.test.ts`:

```ts
import { computeFitScaleX } from "./ocr";

describe("computeFitScaleX", () => {
  const m = (w: number) => () => w; // measurer returning a fixed width
  it("returns boxW / measuredWidth", () => {
    expect(computeFitScaleX("hi", 10, 100, m(50))).toBe(2);
  });
  it("clamps to a max of 10", () => {
    expect(computeFitScaleX("hi", 10, 1000, m(50))).toBe(10);
  });
  it("clamps to a min of 0.1", () => {
    expect(computeFitScaleX("hi", 10, 5, m(100))).toBe(0.1);
  });
  it("falls back to 1 when measure returns 0", () => {
    expect(computeFitScaleX("hi", 10, 100, m(0))).toBe(1);
  });
  it("falls back to 1 when measure returns NaN", () => {
    expect(computeFitScaleX("hi", 10, 100, m(NaN))).toBe(1);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm test:unit src/lib/ocr.test.ts`
Expected: FAIL — `computeFitScaleX` is not exported.

- [ ] **Step 3: Implement** — append to `src/lib/ocr.ts`:

```ts
/**
 * Horizontal scale that fits `text` to `boxW` given a text measurer.
 * `fontPx` and `boxW` must be in the SAME coordinate space (use image-pixel
 * space so the result is zoom-invariant). Falls back to 1 (no stretch) when
 * the measurer can't produce a usable width (e.g. no canvas in SSR/jsdom).
 * Clamped to [0.1, 10] so degenerate OCR boxes can't produce wild stretches.
 */
export function computeFitScaleX(
  text: string,
  fontPx: number,
  boxW: number,
  measure: (text: string, fontPx: number) => number,
): number {
  const w = measure(text, fontPx);
  if (!Number.isFinite(w) || w <= 0) return 1;
  const s = boxW / w;
  if (!Number.isFinite(s)) return 1;
  return Math.min(10, Math.max(0.1, s));
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm test:unit src/lib/ocr.test.ts`
Expected: PASS — all tests (existing 2 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ocr.ts src/lib/ocr.test.ts
git commit -m "feat(ocr): computeFitScaleX text-fit helper"
```

---

## Task 2: Rewrite `OcrLayer` — visible fitted chips

**Files:** Rewrite `src/components/editor/OcrLayer.tsx`.

**Interfaces:**
- Consumes: `useOcr`, `currentResult` (`@/stores/ocr`); `ocrBoxStyle`, `computeFitScaleX` (`@/lib/ocr`).
- Produces: `OcrLayer({ scale })` rendering visible, box-fitted, white-backed selectable chips.

- [ ] **Step 1: Replace the file** with:

```tsx
"use client";

import { useMemo } from "react";
import { useOcr, currentResult } from "@/stores/ocr";
import { ocrBoxStyle, computeFitScaleX } from "@/lib/ocr";

const FONT_STACK = '"Noto Sans Thai", system-ui, -apple-system, sans-serif';
// Font size (image-pixel space) used for measurement & rendering, as a
// fraction of box height so glyphs sit within the box before horizontal fit.
const FONT_FACTOR = 0.8;

// Shared offscreen text measurer. Returns 0 when canvas/text metrics are
// unavailable (SSR / jsdom) so computeFitScaleX falls back to no-stretch.
let measureCanvas: HTMLCanvasElement | null = null;
function measureText(text: string, fontPx: number): number {
  if (typeof document === "undefined") return 0;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = `${fontPx}px ${FONT_STACK}`;
  return ctx.measureText(text).width;
}

/**
 * Visible, box-fitted OCR text overlay aligned to the Konva image. Mounted as a
 * sibling of <Stage> in the same positioned wrapper, so an image-space box maps
 * to screen by `* scale` (displayScale). Each unit is a white-translucent chip
 * with the recognized text rendered near-black and horizontally scaled to fill
 * its box — so the native selection highlights exactly what the user sees.
 * Pure DOM — never appears in exported PNGs.
 */
export function OcrLayer({ scale }: { scale: number }) {
  const mode = useOcr((s) => s.mode);
  const result = useOcr(currentResult);

  // Fit each unit once per result (image-space → zoom-invariant fitX).
  const units = useMemo(() => {
    if (!result) return [];
    const out: {
      key: string;
      text: string;
      bbox: { x: number; y: number; w: number; h: number };
      fitX: number;
      fontPxImg: number;
      lineEnd: boolean;
    }[] = [];
    result.lines.forEach((line, li) => {
      const us =
        line.words.length > 0
          ? line.words
          : [{ text: line.text, bbox: line.bbox }];
      us.forEach((u, wi) => {
        const fontPxImg = u.bbox.h * FONT_FACTOR;
        out.push({
          key: `${li}-${wi}`,
          text: u.text,
          bbox: u.bbox,
          fontPxImg,
          fitX: computeFitScaleX(u.text, fontPxImg, u.bbox.w, measureText),
          lineEnd: wi === us.length - 1,
        });
      });
    });
    return out;
  }, [result]);

  if (!mode || !result) return null;

  return (
    <div
      data-ocr-layer
      className="absolute left-0 top-0 select-text"
      style={{
        width: result.width * scale,
        height: result.height * scale,
        cursor: "text",
        zIndex: 5,
      }}
    >
      {units.map((u) => {
        const s = ocrBoxStyle(u.bbox, scale);
        return (
          <span
            key={u.key}
            style={{
              position: "absolute",
              left: s.left,
              top: s.top,
              width: s.width,
              height: s.height,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              background: "rgba(255,255,255,0.7)",
              borderRadius: 2,
              userSelect: "text",
            }}
          >
            <span
              style={{
                display: "inline-block",
                color: "#0b0b0b",
                fontFamily: FONT_STACK,
                fontSize: u.fontPxImg * scale,
                lineHeight: 1,
                whiteSpace: "pre",
                transform: `scaleX(${u.fitX})`,
                transformOrigin: "left center",
              }}
            >
              {u.text}
              {u.lineEnd ? "\n" : " "}
            </span>
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors from `OcrLayer.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/OcrLayer.tsx
git commit -m "feat(ocr): visible box-fitted text overlay with white backing"
```

---

## Task 3: Detection finish toast

**Files:** Modify `src/stores/ocr.ts`; Modify `src/stores/ocr.test.ts`.

**Interfaces:**
- Consumes: existing `useOcr.detect()`, `toast` from sonner.
- Produces: a result toast on fresh detection (success/no-text). No change to the idempotent cache-hit path (no re-toast) or `reset`.

- [ ] **Step 1: Add the finish toast to `detect()`**

In `src/stores/ocr.ts`, inside `detect()`'s success branch, AFTER caching the result and BEFORE the existing Thai-notice block, add:

```ts
      const lineCount = result.lines.length;
      if (lineCount > 0) {
        toast.success(`Detected ${lineCount} text ${lineCount === 1 ? "line" : "lines"}`);
      } else {
        toast("No text found");
      }
```

(The cache-hit early-return path must remain above this, so re-toggling a cached image does NOT re-toast.)

- [ ] **Step 2: Update the existing store tests for the new toast**

The new finish toast means `detect()` now calls `toast`/`toast.success` on every fresh detection — the existing "Thai notice once" test asserts a raw `toast` call count and will break. Fix the test file `src/stores/ocr.test.ts`:

1. Extend the `sonner` mock so `toast` has a `.success` method:

```ts
const toast = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...a: unknown[]) => toast(...a), {
    success: (...a: unknown[]) => toastSuccess(...a),
    message: (...a: unknown[]) => toast(...a),
  }),
}));
```
(Reset `toastSuccess` in `beforeEach` alongside `toast`.)

2. Change the "shows the Thai notice once" assertion to count only the Thai-notice call (match the message) instead of the raw call count:

```ts
  it("shows the Thai notice once when Thai is unavailable", async () => {
    detectText.mockResolvedValue(fake("x", false));
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    useOcr.getState().setKey("/img/b.png");
    await useOcr.getState().detect();
    const thaiCalls = toast.mock.calls.filter((c) =>
      String(c[0]).includes("Thai"),
    );
    expect(thaiCalls).toHaveLength(1);
  });
```

3. Add finish-toast tests:

```ts
  it("toasts the line count on a successful detection", async () => {
    detectText.mockResolvedValue(fake("hello")); // fake() → 1 line
    useOcr.getState().setKey("/img/a.png");
    await useOcr.getState().detect();
    expect(toastSuccess).toHaveBeenCalledWith("Detected 1 text line");
  });

  it("toasts 'No text found' when there are no lines", async () => {
    detectText.mockResolvedValue({
      width: 10, height: 10, lines: [], languagesUsed: ["en-US"], thaiAvailable: true,
    });
    useOcr.getState().setKey("/img/empty.png");
    await useOcr.getState().detect();
    expect(toast).toHaveBeenCalledWith("No text found");
  });
```

> Note: the existing `fake(text, thai)` helper returns a result with exactly one line, so the count message is "Detected 1 text line" (singular). Keep the idempotency test valid — a second `detect()` on a cached key still must not call `detectText` again (and therefore won't re-toast).

- [ ] **Step 3: Run the store tests → pass**

Run: `pnpm test:unit src/stores/ocr.test.ts`
Expected: PASS — all tests (existing, adjusted, + 2 new).

- [ ] **Step 4: Commit**

```bash
git add src/stores/ocr.ts src/stores/ocr.test.ts
git commit -m "feat(ocr): toast detection result on finish"
```

---

## Task 4: Toolbar spinner while scanning

**Files:** Modify `src/components/editor/toolbar/ToolButton.tsx`; Modify `src/components/editor/Toolbar.tsx`.

**Interfaces:**
- Produces: `ToolButton` accepts optional `iconClassName?: string`; the OCR toggle shows a spinning `Loader2` while `ocrStatus === "scanning"`.

- [ ] **Step 1: Add `iconClassName` to ToolButton**

In `src/components/editor/toolbar/ToolButton.tsx`:
- Add `iconClassName?: string;` to `ToolButtonProps`.
- Destructure `iconClassName` in the component params.
- Change the icon render to:

```tsx
      <Icon className={["h-4 w-4", iconClassName ?? ""].join(" ").trim()} aria-hidden />
```

- [ ] **Step 2: Use a spinner in the OCR toggle**

In `src/components/editor/Toolbar.tsx`:
- Add `Loader2` to the existing `lucide-react` import block.
- In the OCR toggle `ToolButton` (the one with `icon={ScanText}` added previously), change `icon` and add `iconClassName`:

```tsx
        <ToolButton
          icon={ocrStatus === "scanning" ? Loader2 : ScanText}
          iconClassName={ocrStatus === "scanning" ? "animate-spin" : undefined}
          label={
            !hasImage
              ? "Detect text (load an image first)"
              : ocrStatus === "scanning"
                ? "Detecting text…"
                : ocrMode
                  ? "Hide detected text"
                  : "Detect text"
          }
          pressed={ocrMode}
          disabled={!hasImage || ocrStatus === "scanning"}
          onClick={() => void toggleOcr()}
        />
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/toolbar/ToolButton.tsx src/components/editor/Toolbar.tsx
git commit -m "feat(ocr): spinner on detect-text button while scanning"
```

---

## Task 5: Verify + rebuild

- [ ] **Step 1: Full suite**

```bash
pnpm test:unit
pnpm exec tsc --noEmit
pnpm test:e2e:web e2e/web/ocr.spec.ts
```
Expected: unit all green; tsc clean; e2e green (the overlay still contains the recognized text — now visible — so the `[data-ocr-layer]` contains-text assertion holds). If a selector broke because of the new nested-span structure, adjust the e2e assertion to match (still asserting the recognized text is present and idempotent re-toggle invokes `ocr_detect` once).

- [ ] **Step 2: Rebuild the macOS app**

```bash
pnpm tauri build
```
Expected: bundles produced (the `TAURI_SIGNING_PRIVATE_KEY` updater-signature warning at the end is expected and non-fatal). Confirm `src-tauri/target/release/bundle/macos/capz.app` exists.

- [ ] **Step 3: Commit (if any verification-driven fixes were needed)**

Only if Step 1 required an e2e selector adjustment:
```bash
git add e2e/web/ocr.spec.ts
git commit -m "test(ocr): adjust e2e for visible overlay"
```

---

## Self-Review

- **Issue 1 (alignment + visible):** Task 1 (`computeFitScaleX`) + Task 2 (visible fitted chips, white backing, box-pinned width). Selection now follows the visible glyphs. ✓
- **Issue 2 (feedback):** Task 3 (finish toast) + Task 4 (button spinner). ✓
- **Constraints:** copy stays native (chips contain real text + separators); overlay stays DOM (export unaffected); `data-ocr-layer` + mount guard preserved; Latin+Thai font stack; no storage. ✓
- **Type consistency:** `computeFitScaleX(text, fontPx, boxW, measure)` signature matches between Task 1 and its use in Task 2; `ocrBoxStyle` still supplies left/top/width/height; `iconClassName` added in Task 4 Step 1 is consumed in Step 2. ✓
- **Test interaction:** Task 3 explicitly updates the Thai-notice assertion that the new toast would otherwise break. ✓
