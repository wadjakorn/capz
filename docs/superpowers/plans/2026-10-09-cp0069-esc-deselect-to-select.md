# CP-0069 Esc deselects and returns to Select — Implementation Plan

Spec: `docs/superpowers/specs/2026-10-09-cp0069-esc-deselect-to-select-design.md`

## Task 1 — failing jsdom tests for the Esc ladder

File: `src/hooks/useEditorShortcuts.escape.test.tsx` (new)

- sticky tool (default config: all sticky) + selection → one Esc clears
  `selectedId` and sets `tool` to `select`.
- non-sticky tool (`keepToolActive.rect=false`) + selection → same.
- Select tool + selection → deselects, tool stays `select`.
- crop mode → Esc sets `select` (unchanged).
- no selection + sticky tool → Esc sets `select` (unchanged).
- Esc while focus is in an input → no change.

Run `pnpm test:unit src/hooks/useEditorShortcuts.escape.test.tsx`; the
sticky-tool case must fail.

## Task 2 — minimal change

File: `src/hooks/useEditorShortcuts.ts`, selection branch of the Esc block:
replace `if (tool !== "select" && !isStickyTool(tool, keep)) setTool("select")`
with `if (tool !== "select") setTool("select")`. Re-run tests → green.
Commit `fix(editor): Esc with a selection also returns to Select (CP-0069)`.

## Task 3 — L4 visual check

File: `e2e/visual/editor-esc-to-select.spec.ts` — load image, draw a rect
with the sticky Shapes tool, select it, `snap()` before, press Esc once,
`snap()` after, assert Select is the active tool and the transformer is gone.

## Task 4 — verification + tracker + PR

L1, L3, L4; add `PROGRESS-BUG.md` entry; push; open PR.
