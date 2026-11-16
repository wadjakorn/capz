# CP-0099 OCR area scope — Implementation Plan (rev 2, after /scrutinize)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In OCR mode, dragging a box on the image instantly limits the OCR text to that box and selects it, so ⌘A → ⌘C copies only what the user wants.

**Architecture:** Frontend only; nothing changes in Rust or IPC.
- **Geometry.** A pure module `src/lib/ocrScope.ts` decides which **whole-image** words are in scope: a word is in when its bbox centre lies inside the box. It rebuilds each kept line and orders the lines.
- **Store.** `src/stores/ocr.ts` holds one `scope` (the box and the lines it kept).
- **Overlay.** `OcrLayer` owns the gesture, the outline and dimming, auto-selection and the ⌘C safety net.
- **Esc.** Handled in the existing Esc ladder in `useEditorShortcuts`.
- **Copy.** Stays native, as today.

**Tech Stack:** Next.js 15 static export, TypeScript 5 strict, Zustand 5, Vitest (+ Testing Library), Playwright.

**Spec:** PM ticket CP-0099 `## Proposal` + `## Decisions` (rev 3). The build stage commits it as `docs/superpowers/specs/2026-11-16-cp0099-ocr-area-scope-design.md` and this plan as `docs/superpowers/plans/2026-11-16-cp0099-ocr-area-scope.md`.

## Global Constraints

- **Out of scope:** no Rust change, no IPC change, no re-scan. Re-scanning the box to recover missed words is CP-0100 (`blocked-by` this ticket, `relates` CP-0098).
- pnpm only, and no new packages.
- Desktop only. The OCR UI is already Tauri-gated, `/paste` doesn't change, and there is no `localStorage`.
- No settings change, so no `CONFIG_SCHEMA_VERSION` bump.
- Constants:
  - `MIN_SCOPE_PX = 8` image px. Below it, a release counts as a click.
  - Drag threshold: 4 **screen** px.
- New UI copy, exactly as written: `app.ocr.scopeHint`, en `Drag a box to copy only part of the text`, th `ลากกรอบเพื่อคัดลอกเฉพาะบางส่วน`.
- The box and the dimming are DOM inside `[data-ocr-layer]`, so they never reach the export.
- Reuse `unionAABB` from `src/lib/annotationBounds.ts:128`; don't write a second union helper.
- Commits are conventional and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **⌘C when nothing is selected while a scope is active.** For example, the user clicked the toolbar, or the box holds no text. It must never fall through to the editor's whole-image copy (`src/app/editor/page.tsx:497-525`), which can also close the editor when `copyClosesEditor` is on. Test: Task 4 e2e, "⌘C never copies the image while scoped".
2. **Esc pressed in the Settings view or a text field while a scope exists.** EditorStage stays mounted, only hidden, in Settings (`page.tsx:650-655`). Esc must clear the scope only where the editor's Esc ladder would act. Test: Task 3, "does not clear the scope while typing".
3. **A drag whose mouseup never arrives** (the user switches apps mid-drag, or a macOS ctrl-click opens the native menu). The draft must end, and no listener may be left behind. Test: Task 4 e2e, "a move with no button held ends the drag".
4. **A Vision line whose `words` don't cover its text** (Vision skips a word whose range lookup fails, `macos.rs:188-205`). A partly kept line must not silently lose words. Test: Task 1, "falls back to the whole line when words don't cover its text".
5. **Zooming or scrolling during or after scoping.** The box and the chips must stay aligned. Test: Task 4 e2e, "zoom keeps the box aligned".

---

### Task 1: Pure scope geometry

**Files:**
- Create: `src/lib/ocrScope.ts`, `src/lib/ocrScope.test.ts`

**Interfaces:**
- Consumes: the `OcrBox`, `OcrWord`, `OcrLine` types from `src/lib/ocr.ts`, and `unionAABB` from `src/lib/annotationBounds.ts`.
- Produces:
  - `MIN_SCOPE_PX = 8`
  - `rectFromPoints(a: {x:number;y:number}, b: {x:number;y:number}, imgW: number, imgH: number): OcrBox`: normalized and clamped to `[0,imgW]×[0,imgH]`
  - `isScopeTooSmall(r: OcrBox): boolean`: `r.w < 8 || r.h < 8`
  - `pointInRect(p: {x:number;y:number}, r: OcrBox): boolean`
  - `lineWords(line: OcrLine): OcrWord[]`: returns `line.words`, **unless** they are empty **or** their texts joined by `" "` don't equal `line.text` with its whitespace collapsed. In those cases it returns `[{ text: line.text, bbox: line.bbox }]`, i.e. line granularity.
  - `scopeLines(lines: OcrLine[], rect: OcrBox): OcrLine[]`

- [ ] **Step 1: Write the failing tests.**

```ts
it("normalizes a reversed drag and clamps it to the image", () =>
  expect(rectFromPoints({ x: 300, y: 200 }, { x: -10, y: 50 }, 800, 600)).toEqual({ x: 0, y: 50, w: 300, h: 150 }));
it("treats a box under 8 image px as too small", () => {
  expect(isScopeTooSmall({ x: 0, y: 0, w: 7.9, h: 100 })).toBe(true);
  expect(isScopeTooSmall({ x: 0, y: 0, w: 8, h: 8 })).toBe(false);
});
// "Hello big world" bbox (0,0,150,20): Hello (0,0,50,20), big (60,0,30,20), world (100,0,50,20)
it("keeps words whose centre is inside and rebuilds the line", () =>
  expect(scopeLines([hello], { x: 55, y: 0, w: 145, h: 20 })).toEqual([
    { text: "big world", bbox: { x: 60, y: 0, w: 90, h: 20 }, words: [big, world] },
  ]));
it("returns the original line object when every word is in scope", () =>
  expect(scopeLines([hello], { x: 0, y: 0, w: 200, h: 40 })[0]).toBe(hello));
it("drops a line with no word inside", () => expect(scopeLines([hello], { x: 300, y: 0, w: 50, h: 50 })).toEqual([]));
it("treats a line without word boxes as one word", () => /* words: [] + line centre inside → kept as-is; outside → dropped */);
it("falls back to the whole line when words don't cover its text", () => {
  // Vision skipped "big": line.text "Hello big world", words [Hello, world]
  // rect covering only world's centre → line kept or dropped by the LINE centre, never rebuilt as "world"
});
it("orders rows top-down and lines within a row left-to-right", () => {
  // A (400,100,100,30), B (0,104,100,30), C (0,160,100,30) → [B, A, C]
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `pnpm test:unit src/lib/ocrScope`

- [ ] **Step 3: Implement `src/lib/ocrScope.ts`.** The only non-obvious parts are the line rebuild and the ordering:

```ts
// kept = lineWords(line).filter(w => centreIn(w.bbox, rect))
// none → drop; kept.length === lineWords(line).length → original line object;
// else { text: kept.map(w => w.text).join(" "), bbox: unionAABB(kept.map(w => w.bbox))!, words: kept }
// order: sort by centre y; a line joins the open row when |cy − row.cy| < 0.5 × min(h, row.h) (row.cy = first line's);
// output rows top-down, each row sorted by x
```

- [ ] **Step 4: Run, expect PASS.** Run: `pnpm test:unit src/lib/ocrScope && pnpm exec tsc --noEmit`

- [ ] **Step 5: Commit.** `feat(ocr): scope geometry — in-scope words, line rebuild, order (CP-0099)`

---

### Task 2: Store — the scope and the hint toast

**Files:**
- Modify: `src/stores/ocr.ts`, `src/stores/ocr.test.ts`
- Modify: `src/i18n/locales/en/app.ts`, `src/i18n/locales/th/app.ts` (`app.ocr.scopeHint`)

**Interfaces:**
- Consumes: `scopeLines` and `isScopeTooSmall` (Task 1).
- Produces, in `useOcr` state:
  - `scope: { rect: OcrBox; lines: OcrLine[] } | null`. The lines are computed once in `setScope`, so selectors return stable references (Zustand 5 + `useSyncExternalStore` loops on fresh arrays).
  - `scopeHintShown: boolean`. It survives `reset()`, like `thaiNoticeShown`.
  - `setScope(rect: OcrBox): void`. It is a no-op unless `mode` is on, there is a whole-image result for `currentKey`, and `!isScopeTooSmall(rect)`. When the scope is empty, it toasts `app.ocr.noText`.
  - `clearScope(): void`
  - `export const visibleLines = (s: State): OcrLine[] | null`: `s.scope ? s.scope.lines : currentResult(s)?.lines ?? null`
  - `scope` becomes `null` in `toggle()` when turning off, and in `setKey()` and `reset()`.

- [ ] **Step 1: Write the failing tests** in `ocr.test.ts`.
  - Fixture `TWO_COL`, 800×600: lines "Left one" (40,100,200,30), "Left two" (40,160,200,30), "Right one" (440,100,200,30) and "Right two" (440,160,200,30). Each has two word boxes, e.g. Left (40,100,80,30) and one (130,100,110,30).
  - Box: `RECT = { x: 20, y: 80, w: 340, h: 140 }`.
  - Change `beforeEach` to `useOcr.setState({ thaiNoticeShown: false, scopeHintShown: false })`.

```ts
it("setScope keeps only the boxed lines and does not re-scan", async () => {
  // detect TWO_COL, then setScope(RECT)
  expect(useOcr.getState().scope!.lines.map((l) => l.text)).toEqual(["Left one", "Left two"]);
  expect(visibleLines(useOcr.getState())!.map((l) => l.text)).toEqual(["Left one", "Left two"]);
  expect(detectText).toHaveBeenCalledTimes(1);
});
it("ignores a box under 8×8 image px, with OCR off, or before a result exists", ...);
it("toasts No text found when the box holds no text", /* RECT over (600,400,100,100) → scope.lines [] + toast("No text found") */);
it("clearScope, toggling off, a new key and reset all clear the scope", ...);
it("the first detection toast carries the scope hint once per session", () => {
  // first: toastSuccess called with ("Detected 1 text line", { description: "Drag a box to copy only part of the text" })
  // after reset() + new key: toastSuccess last called with exactly one arg ("Detected 1 text line")
});
```

  Update the existing `"toasts the line count on a successful detection"` test to expect the hint argument, since it is now the session's first detection.

- [ ] **Step 2: Run, expect FAIL.** Run: `pnpm test:unit src/stores/ocr`

- [ ] **Step 3: Implement.** For the hint: in `detect()`, when `lineCount > 0 && !scopeHintShown`, call `toast.success(msg, { description: t("app.ocr.scopeHint") })` and set the flag. Otherwise call `toast.success(msg)` with **one** argument.

- [ ] **Step 4: Run, expect PASS.** Run: `pnpm test:unit src/stores/ocr && pnpm exec tsc --noEmit`

- [ ] **Step 5: Commit.** `feat(ocr): scope state + one-time hint (CP-0099)`

---

### Task 3: Esc clears the scope, via the editor's own Esc ladder

**Files:**
- Modify: `src/hooks/useEditorShortcuts.ts` (Esc block at `:152`)
- Test: `src/hooks/useEditorShortcuts.escape.test.tsx`

**Interfaces:**
- Consumes: `useOcr` `scope` and `clearScope` (Task 2).

- [ ] **Step 1: Write the failing tests** in the existing `describe("useEditorShortcuts — Esc ladder (CP-0069)")`:
  - `"Esc clears an OCR scope first and does nothing else"`: set a scope, a selection and a sticky tool. After Esc: scope is `null`, the selection and the tool are unchanged, and the double-Esc hide is not armed (`escArmedAt` untouched, no `ESC_TOAST_ID` toast).
  - `"does not clear the scope while typing"`: Esc with an `<input>` as the target leaves the scope in place. This is Review Focus 2; it is covered by the existing `isTypingTarget` guard at `:66`.
- [ ] **Step 2: Run, expect FAIL.** Run: `pnpm test:unit src/hooks/useEditorShortcuts.escape`
- [ ] **Step 3: Implement.** Make this the first rung inside `if (key === "escape") {`, after `e.preventDefault()`: `if (useOcr.getState().scope) { useOcr.getState().clearScope(); return; }`. No capture-phase listener: a window-capture `stopPropagation` would also catch Esc meant for menus and Settings fields.
- [ ] **Step 4: Run, expect PASS.** Run: `pnpm test:unit src/hooks`
- [ ] **Step 5: Commit.** `feat(ocr): Esc clears the OCR scope (CP-0099)`

---

### Task 4: OcrLayer — gesture, box, auto-select, ⌘C safety net

**Files:**
- Modify: `src/components/editor/OcrLayer.tsx`
- Test: `e2e/web/ocr.spec.ts` (new tests; the existing ones must stay green)

**Interfaces:**
- Consumes: `visibleLines`, `scope`, `setScope` and `clearScope` (Task 2), and `rectFromPoints`, `isScopeTooSmall` and `pointInRect` (Task 1).
- Produces the DOM contract the e2e tests rely on:
  - `[data-ocr-layer]` (unchanged);
  - `[data-ocr-scope]` once a scope is set;
  - `[data-ocr-scope-draft]` while dragging.

- [ ] **Step 1: Write the failing e2e tests** in `e2e/web/ocr.spec.ts`.
  - **Harness:** before `page.goto("/editor")`, build an 800×600 PNG in-page on `about:blank` (two text columns drawn on a white `<canvas>`, then `toDataURL`). Serve it for `/asset\.localhost/`; the existing 1×1 PNG makes the layer's scale meaningless.
  - **Mock:** `ocr_detect` returns the `TWO_COL` fixture from Task 2, with literals inline (the mock serializes the handler via `toString()`).
  - **Coordinates:** image px → screen px via `k = layerBox.width / 800`.
  - **Comparing selections:** `sel = (await page.evaluate(() => getSelection()!.toString())).replace(/\n+/g, "\n").trim()`. Block-level chips plus the literal `"\n"` can double the newlines.

```ts
test("drag a box: only that area's text shows and is pre-selected; ⌘A stays inside; no re-scan", ...);
   // Detect text → drag (20,80)→(360,220) steps:5 → [data-ocr-scope] visible; layer has "Left one", not "Right one"
   // sel === "Left one\nLeft two"; ControlOrMeta+a → same; ocr_detect call count === 1
test("Esc and a click outside the box bring back the whole-image text", ...);
   // Esc → no [data-ocr-scope], "Right one" back; new box → click at (600,400) → cleared; a click INSIDE keeps it
test("a tiny drag acts as a click; double-click still selects a word", ...);
   // 3-px drag outside an existing box → scope cleared; with no scope → nothing; dblclick "Right" chip → sel contains "Right"
test("⌘C never copies the image while scoped", ...);                   // Review Focus 1
   // (a) scope set → removeAllRanges() → ControlOrMeta+c → sel === "Left one\nLeft two", no "Copied" toast
   // (b) box over empty (600,400)-(780,580) → ControlOrMeta+c → no "Copied" toast, editor still open
test("a move with no button held ends the drag", ...);                 // Review Focus 3
   // mouse.down → move 50px → page.evaluate dispatch mousemove {buttons:0} on window → draft gone, scope set from last point;
   // further mouse.move → no [data-ocr-scope-draft]
test("release outside the image clamps the box", ...);
   // drag (700,500) → beyond layer bottom-right → scope rect ends at 800×600 (assert box style ≈ layer edge ±1px)
test("zoom keeps the box aligned", ...);                               // Review Focus 5
   // scope set → ControlOrMeta+Equal → [data-ocr-scope] bbox / layer bbox ratios unchanged (±1px)
```

- [ ] **Step 2: Run, expect FAIL.** Run: `CI=1 pnpm test:e2e:web e2e/web/ocr.spec.ts` (loop: inside `flock "$CAPZ_LOOP_E2E_LOCK"`)

- [ ] **Step 3: Implement in `OcrLayer.tsx`.**
  - **Lines.** Chips come from `visibleLines` (the layer stays sized by `result.width/height`).
  - **Mouse down.** `onMouseDown` on the layer root. Use mouse events, not pointer events: text selection is mousedown's default action.
    - Return on `e.button !== 0` or `e.detail > 1`. Double and triple clicks stay native.
    - Otherwise `e.preventDefault()`. If `document.activeElement` is an input, textarea or contentEditable, blur it; otherwise ⌘A and ⌘C would go to that field. Remember the start point in image px.
    - Add **window** listeners: `mousemove`, `mouseup` and `blur`. Keep them in a ref and remove them in one `end()`, which also runs on unmount.
  - **Mouse move.**
    - Re-read `layer.getBoundingClientRect()` on every move, because the canvas can scroll or zoom mid-drag.
    - If `(ev.buttons & 1) === 0`, treat the move as a release at that point.
    - At ≥ 4 screen px from the start, mark the gesture as dragging, call `getSelection()?.removeAllRanges()`, and render the draft as `rectFromPoints(start, p, w, h)`.
  - **Mouse up**, or a buttonless move:
    - If dragging and `!isScopeTooSmall(r)`, call `setScope(r)`.
    - Otherwise it is a click: `getSelection()?.removeAllRanges()`, and when a scope exists and `!pointInRect(start, scope.rect)`, call `clearScope()`.
  - **Window blur:** `end()` without applying anything.
  - **Box.** One `<div data-ocr-scope>` at `rect × scale`, with `pointer-events: none` and `border: 1.5px dashed #6d7cff`. It dims the outside with `box-shadow: 0 0 0 100000px rgba(0,0,0,0.35)`, clipped by `overflow: hidden` on the layer root. The draft `<div data-ocr-scope-draft>` has the same border and no dimming.
  - **Auto-select.** Pull the existing ⌘A range code into `selectLayer()`. Call it from an effect whenever `scope` changes to a non-null value with lines.
  - **⌘C safety net.** Extend the existing capture-phase `keydown` effect: on ⌘/Ctrl+C with a `scope` set and a collapsed or empty selection:
    - with lines → `selectLayer()`, and **no** `preventDefault`. The native copy proceeds, and `page.tsx:506` now sees a selection.
    - without lines → `preventDefault()` + `stopPropagation()`, since there is nothing to copy and the image must not be copied either.
  - **Hidden guard.** Skip both the ⌘A and the ⌘C handling when `layer.closest('[aria-hidden="true"]')` is set, i.e. the Settings view (`page.tsx:653`).
  - **Cursor.** `crosshair` on the layer and on the chips, since a drag now draws a box.

- [ ] **Step 4: Run L1 + L3.** Run: `pnpm test:unit && pnpm exec tsc --noEmit && pnpm build && CI=1 pnpm test:e2e:web`
  Expected: everything passes, including the existing OCR tests ("idempotent re-toggle" and "⌘A").

- [ ] **Step 5: Commit.** `feat(ocr): drag a box to scope OCR text (CP-0099)`

---

### Task 5: Visual check, manual QA, tracker

**Files:**
- Create: `e2e/visual/editor-ocr-scope.spec.ts`
- Modify: `docs/manual-qa.md` (new "OCR — area scope" rows), `PROGRESS-FEATURE.md` (`## Open` entry)

**Interfaces:**
- Consumes: the Task 4 DOM contract, and `snap()` from `e2e/visual/helpers.ts`. Don't use `loadImage()`: it drives `/paste`, which has no OCR. Reuse the `/editor` + mock + generated-PNG harness from Task 4.

- [ ] **Step 1: Write the visual spec.** Detect text, then `snap(page, "full")`. Drag halfway, then `snap(page, "dragging")`. Release, then `snap(page, "scoped")`. Assert on the DOM: the scope box is present and "Right one" is absent.
- [ ] **Step 2: Run it.**
  Run: `CI=1 CAPZ_VISUAL_OUT=$PWD/e2e/visual-out pnpm test:e2e:visual editor-ocr-scope` (loop: under the e2e lock; `visual-report.mjs` after the PR exists)
  Expected: 1 passed, and 3 PNGs.
- [ ] **Step 3: Manual QA rows**, for the owner on macOS (Vision and OpenThai) and Windows:
  - two-column screenshot → box → ⌘C → paste;
  - **⌘C in WKWebView** copies the selected scope text, not the image (unverifiable headless);
  - a box edge through a line keeps whole words only;
  - Esc, click outside, zoom;
  - double-click a word;
  - Esc in Settings search doesn't touch the editor.
- [ ] **Step 4: Add the tracker entry**, then run the full gate:
  `pnpm test:unit && pnpm exec tsc --noEmit && pnpm build`.
  No Rust changed, so L2 and L5 are not required.
- [ ] **Step 5: Commit.** `test(ocr): visual check + manual QA for OCR area scope (CP-0099)`
