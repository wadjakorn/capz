# OCR Overlay — Line-Level Chips, Solid White, Select-All (refinement 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** From the second smoke test: (1) drop the translucent backing for **solid white**; (2) render **one chip per line** instead of per word (fewer pills → easy drag-select); (3) **⌘/Ctrl+A** selects all OCR text (native selection thereafter). Thai already works — no change.

**Architecture:** `OcrLayer` groups by line (`line.bbox` + `line.text`), fits each line to its box with `computeFitScaleX`, renders a solid-white chip with near-black visible text. A capture-phase key handler (active only while OCR mode is on) maps ⌘/Ctrl+A to a native `selectNodeContents` over the overlay. Highlight/copy stay 100% native.

**Tech Stack:** Next.js 15, React 19, Zustand 5, Vitest, Playwright.

## Global Constraints
- pnpm only; no localStorage; copy stays native; overlay stays pure DOM (excluded from PNG export) with `data-ocr-layer` + `mode && currentResult` mount guard; font stack covers Latin + Thai; OCR boxes top-left image-pixel space, mapped by ×`displayScale`.

---

## Task S1: Line-level solid-white overlay + select-all

**Files:** Rewrite `src/components/editor/OcrLayer.tsx`.

**Interfaces:** Consumes `useOcr`, `currentResult` (`@/stores/ocr`); `ocrBoxStyle`, `computeFitScaleX` (`@/lib/ocr`). Produces `OcrLayer({ scale })` rendering one solid-white chip per line + a scoped ⌘/Ctrl+A select-all.

- [ ] **Step 1: Replace the file** with:

```tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useOcr, currentResult } from "@/stores/ocr";
import { ocrBoxStyle, computeFitScaleX } from "@/lib/ocr";

const FONT_STACK = '"Noto Sans Thai", system-ui, -apple-system, sans-serif';
// Font size (image-pixel space) for measurement & rendering, as a fraction of
// line-box height so glyphs sit within the box before horizontal fit.
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
 * Visible OCR text overlay — one solid-white chip PER LINE, aligned to the
 * Konva image. Mounted as a sibling of <Stage> in the same positioned wrapper,
 * so an image-space box maps to screen by `* scale` (displayScale). Each line's
 * text is rendered near-black and horizontally scaled to fill its line box, so
 * native selection highlights what the user sees. ⌘/Ctrl+A selects the whole
 * overlay. Pure DOM — never appears in exported PNGs.
 */
export function OcrLayer({ scale }: { scale: number }) {
  const mode = useOcr((s) => s.mode);
  const result = useOcr(currentResult);
  const layerRef = useRef<HTMLDivElement>(null);

  // One unit per non-empty line (line box + full line text), fitted once per
  // result (image-space → zoom-invariant fitX).
  const lines = useMemo(() => {
    if (!result) return [];
    return result.lines
      .map((line, li) => {
        const fontPxImg = line.bbox.h * FONT_FACTOR;
        return {
          key: String(li),
          text: line.text,
          bbox: line.bbox,
          fontPxImg,
          fitX: computeFitScaleX(line.text, fontPxImg, line.bbox.w, measureText),
        };
      })
      .filter((l) => l.text.length > 0);
  }, [result]);

  // ⌘/Ctrl+A selects the entire overlay, scoped to the OCR text. The selection,
  // highlight, and ⌘C copy that follow are all native OS behavior. Capture phase
  // so it pre-empts any other Cmd+A handling while OCR read mode is on.
  useEffect(() => {
    if (!mode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "a" && e.key !== "A") return;
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      const layer = layerRef.current;
      const sel = window.getSelection();
      if (!layer || !sel) return;
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(layer);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

  if (!mode || !result) return null;

  return (
    <div
      ref={layerRef}
      data-ocr-layer
      className="absolute left-0 top-0 select-text"
      style={{
        width: result.width * scale,
        height: result.height * scale,
        cursor: "text",
        zIndex: 5,
      }}
    >
      {lines.map((l) => {
        const s = ocrBoxStyle(l.bbox, scale);
        return (
          <span
            key={l.key}
            style={{
              position: "absolute",
              left: s.left,
              top: s.top,
              width: s.width,
              height: s.height,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              background: "#ffffff",
              borderRadius: 2,
              userSelect: "text",
            }}
          >
            <span
              style={{
                display: "inline-block",
                color: "#0b0b0b",
                fontFamily: FONT_STACK,
                fontSize: l.fontPxImg * scale,
                lineHeight: 1,
                whiteSpace: "pre",
                transform: `scaleX(${l.fitX})`,
                transformOrigin: "left center",
              }}
            >
              {l.text}
              {"\n"}
            </span>
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check** — `pnpm exec tsc --noEmit` → no errors.
- [ ] **Step 3: Commit** — `git add src/components/editor/OcrLayer.tsx && git commit -m "feat(ocr): line-level solid-white chips + select-all"`

---

## Task S2: e2e for line-level + select-all, then verify & rebuild

**Files:** Modify `e2e/web/ocr.spec.ts`.

- [ ] **Step 1: Strengthen the e2e** — in the existing "renders detected text and re-toggle is idempotent" test (the mock returns a line "Hello world"), after the overlay appears add assertions:
  - line-level: `[data-ocr-layer] > span` count equals the number of mocked lines (1 for the current mock). Use `await expect(page.locator("[data-ocr-layer] > span")).toHaveCount(1);`
  - select-all: press the select-all shortcut and assert the selection text contains the recognized text:
    ```ts
    await page.locator("[data-ocr-layer]").click(); // focus the editor area
    await page.keyboard.press("ControlOrMeta+a");
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
    expect(selected).toContain("Hello");
    ```
    If `ControlOrMeta` is unsupported by the installed Playwright, use `Meta+a` (the web project runs Desktop Chrome on macOS). If the selection assertion proves flaky in headless Chromium, downgrade it to a `test.fixme` documenting manual verification rather than committing a flaky test — note which you did.

- [ ] **Step 2: Full verification**
```bash
pnpm test:unit
pnpm exec tsc --noEmit
pnpm test:e2e:web e2e/web/ocr.spec.ts
```
Expected: unit 14/14 (unchanged); tsc clean; e2e green (overlay still contains "Hello"; one chip per line; select-all selects it).

- [ ] **Step 3: Commit** — `git add e2e/web/ocr.spec.ts && git commit -m "test(ocr): line-level chip count + select-all e2e"`

- [ ] **Step 4: Rebuild** — `pnpm tauri build` (frontend-only; the `TAURI_SIGNING_PRIVATE_KEY` warning at the end is expected/non-fatal). Confirm `src-tauri/target/release/bundle/macos/capz.app` is freshly written.

---

## Self-Review
- Solid white: `background: "#ffffff"`. ✓
- One chip per line: `result.lines.map(...)`, no per-word units; empty lines filtered. ✓
- ⌘/Ctrl+A: capture-phase handler, scoped `selectNodeContents(layer)`, native selection after. ✓
- Thai: font stack unchanged (`"Noto Sans Thai"` first), still renders. ✓
- Contracts: `data-ocr-layer`, mount guard, copy separators (line text + `\n`), DOM-only export. ✓
- `computeFitScaleX` / `ocrBoxStyle` signatures unchanged (reused). ✓
