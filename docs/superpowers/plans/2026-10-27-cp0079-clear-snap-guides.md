# CP-0079 Clear snap guides — implementation plan

Spec: `docs/superpowers/specs/2026-10-27-cp0079-clear-snap-guides-design.md`

**Goal:** guides disappear when a gesture ends and never appear in an export.

## Task 1 — `withScreenChromeHidden` helper

- Test first: `src/lib/screenChrome.test.ts` — fake stage with two
  `.screen-chrome` nodes (one already hidden): during `fn` both are hidden;
  afterwards the visible one is restored, the hidden one stays hidden; restore
  also happens when `fn` throws; return value is passed through.
- Implement `src/lib/screenChrome.ts`: `SCREEN_CHROME = "screen-chrome"`,
  `withScreenChromeHidden(stage, fn)`.

## Task 2 — export goes through it

- Test first: `src/lib/exportImage.test.ts` (or extend existing) — export
  `exportRegion`; a fake stage's `toDataURL` records the chrome node's
  visibility → must be `false`; restored to `true` afterwards.
- Wrap `stage.toDataURL` in `exportRegion` (`src/lib/exportImage.ts`) and the
  thumbnail in `src/stores/workspaces.ts`.
- Name the guide `Layer` in `EditorStage.tsx` `SCREEN_CHROME`.

## Task 3 — store clears guides on tool change / undo / redo

- Test first: `src/stores/editor.guides.test.ts` — set guides, then `setTool`,
  `undo`, `redo` each leave `guides` empty.
- Add `guides: { x: [], y: [] }` to those `set` calls in `src/stores/editor.ts`.

## Task 4 — resize and pointer release clear guides

- `snapResize` in `EditorStage.tsx`: compute the snapped box, then clear
  guides (no live resize phase).
- `useEffect` window listeners (`mouseup`, `touchend`, `touchcancel`, `blur`)
  that clear non-empty guides.
- Test: L4 visual spec `e2e/visual/editor-snap-guides-clear.spec.ts` — draw
  two rects, resize the second so its edge snaps to the first, release →
  no guide lines on the stage; drag one rect so it snaps and, while still held,
  run an export snapshot via the stage and assert no guide pixels.

## Task 5 — verify + tracker + PR

- L1 (unit, tsc, build), L3 (web e2e), L4 (visual).
- `PROGRESS-BUG.md` open entry; PR with `capz-loop` label.
