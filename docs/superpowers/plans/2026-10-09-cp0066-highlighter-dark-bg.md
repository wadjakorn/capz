# CP-0066 Highlighter on dark backgrounds — Implementation Plan

Spec: `docs/superpowers/specs/2026-10-09-cp0066-highlighter-dark-bg-design.md`

**Goal:** pick `multiply` or `screen` per highlighter stroke from the base
image's luminance under it.

## Task 1 — pure mode picker (TDD)

Files: `src/lib/highlightBlend.ts`, `src/lib/highlightBlend.test.ts`

1. Tests for `lumaGridFromRGBA(data, cols, rows, srcW, srcH)` and
   `pickHighlightBlend(grid, box)`: black → `screen`, white → `multiply`,
   `#808080` → `multiply`, 75% black/25% white → `screen`, 25% black → `multiply`,
   box outside image → `multiply`, null grid → `multiply`, transparent → `multiply`.
2. Run, see them fail.
3. Implement; run green; commit.

## Task 2 — stroke box + grid cache

Files: same.

1. Tests for `highlightBox(points, strokeWidth, offX, offY)` (pads by half
   width, applies crop offset, null for < 2 points).
2. Implement `highlightBox` and `lumaGridFor(img)` (offscreen canvas,
   `WeakMap` cache, null when no 2D context).
3. Green; commit.

## Task 3 — wire into EditorStage

File: `src/components/editor/EditorStage.tsx`

1. `useHighlightBlend(img, points, strokeWidth, offX, offY)` hook (memoised).
2. Draft `<Line>` and `HighlighterShape` use it instead of `"multiply"`.
3. `tsc`, unit tests; commit.

## Task 4 — visual check (L4)

File: `e2e/visual/editor-highlighter-dark.spec.ts` (+ helper to paste a
solid-colour image).

1. Paste a black image, draw a highlighter stroke, snap, assert the stage
   pixel under the stroke is bright (R,G > 80); repeat on white (stroke
   pixel is yellow: B well below R).
2. Run with the e2e lock; commit.

## Task 5 — verify + hand-off

L1, L3, L4; PROGRESS-BUG.md entry; PR.
