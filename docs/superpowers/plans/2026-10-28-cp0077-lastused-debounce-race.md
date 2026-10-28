# CP-0077 lastUsed debounce race — implementation plan

Spec: `docs/superpowers/specs/2026-10-28-cp0077-lastused-debounce-race-design.md`

**Goal:** a Toolbar pick inside the 500 ms window survives the debounced flush.

## Task 1 — `lastUsedWriter` module (TDD)

- Test first: `src/lib/lastUsedWriter.test.ts` (`vi.useFakeTimers`, reset
  `useSettings` to `DEFAULT_CONFIG` with `rememberLastTool` on):
  1. schedule a full rect patch → `writeLastUsedNow({rect:{shape:"ellipse"}})`
     at 200 ms → advance 500 ms → `rect.shape === "ellipse"`, other rect fields
     from the drawn shape.
  2. untouched slot (arrow) and another field in the same slot flush normally.
  3. two schedules inside the window → one `setLastUsed` call.
  4. `cancelLastUsed` drops the pending write; crop tool is not persisted.
- Implement `src/lib/lastUsedWriter.ts` (`scheduleLastUsed`,
  `dropPendingLastUsed`, `cancelLastUsed`, `writeLastUsedNow`), moving the
  flush body from `EditorStage`.

## Task 2 — wire it in

- `EditorStage.tsx`: replace the ref/timer with `scheduleLastUsed`; unmount
  cleanup → `cancelLastUsed`.
- `Toolbar.tsx`: `patchLastUsed` → `writeLastUsedNow(patch)`.

## Task 3 — e2e

- `e2e/web/shape-stroke-style.spec.ts`: drop the 700 ms wait and CP-0077
  comment from `settle()` (Esc only).
- L4 visual `e2e/visual/lastused-pick-after-draw.spec.ts`: draw rect → Esc →
  pick Circle immediately → draw → snapshot → stage has an ellipse.

## Task 4 — verify + tracker + PR

- L1, L3, L4. `PROGRESS-BUG.md` open entry; PR with `capz-loop` label.
