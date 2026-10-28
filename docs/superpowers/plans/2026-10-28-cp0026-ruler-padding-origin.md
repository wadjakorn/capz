# CP-0026 Rulers count the padding — Implementation Plan

Spec: `docs/superpowers/specs/2026-10-28-cp0026-ruler-padding-origin-design.md`

**Goal:** ruler labels read `0` at the outer edge of the exported canvas and
`W`/`H` at its far edge.

## Task 1 — `rulerTicks` helper (TDD)

- Test `src/lib/rulerTicks.test.ts`:
  - pad 0-style case (scroll = pad, scale 1): first major at pos 0.5 label 0.
  - backdrop padding 64: canvas origin at `pad`, label `64` at `pad + 64`.
  - overflow: label at canvas far edge equals canvas width.
  - zoom 2 / 0.5: majors are multiples of `step` from zero; minors exclude
    nothing outside `[0, length]`.
- Implement `src/lib/rulerTicks.ts` (`niceStep` moves here, exported).
- Commit `test+feat`.

## Task 2 — wire into `Rulers.tsx`

- Replace both axes' tick loops with `rulerTicks`; drop `originX/originY`
  props + comments; remove the props from `EditorStage.tsx`.
- `pnpm exec tsc --noEmit`, commit.

## Task 3 — e2e / visual

- `e2e/visual/editor-rulers-padding.spec.ts`: load image, show rulers, enable
  backdrop with padding, snap before/after.
- Run L1, L3, L4.

## Task 4 — tracker + PR

- `PROGRESS-BUG.md` open entry, PR, ticket → completed.
