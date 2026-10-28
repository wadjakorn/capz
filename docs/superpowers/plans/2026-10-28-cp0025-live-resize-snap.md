# CP-0025 live resize snap — implementation plan

Spec: `docs/superpowers/specs/2026-10-28-cp0025-live-resize-snap-design.md`

TDD: each task = failing test → minimal code → green → commit.

## Task 1 — snap engine: lines + pick rule (`src/lib/snap.ts`)
- Tests (`src/lib/snap.test.ts`): `buildSnapLines` (canvas + image lines are
  `canvas`, element lines carry their extent, viewport pruning, dedupe);
  `snapMove`: canvas bonus (canvas 5 px vs element 4 px → canvas; element
  1 px → element), exact tie → canvas nudge + both guides, two tied elements
  → nearest on the other axis wins, nothing in range → no guides.
- Replace `snapValue` / `snapAxis` / `snapResizedBox` / `collectTargets`.

## Task 2 — `snapResize` + `snapPoint` + `isSnapBypass`
- Tests: edge anchor snaps one axis; free corner snaps both; keepRatio
  corner keeps ratio and lands on the better axis (opposite corner fixed);
  centered mirrors; minSize guard; `snapPoint`; `isSnapBypass` for
  alt/mod(mac, win)/none.

## Task 3 — config `general.snapBypassKey` (schema v8)
- Tests: shape test (regen `shape.v8.json`), `v8.json` fixture, migration
  test: v7 store → `"alt"`; existing value kept; default `"mod"`.
- `src/lib/config.ts` type, default, validator `inSet`, `CONFIG_MIGRATIONS[7]`.

## Task 4 — Settings UI
- `registry.ts` `editor.snapBypass` (addedIn 0.20.0), `EditorPage.tsx`
  select, en/th strings, Snap hint with the key. Drift test stays green.

## Task 5 — wire EditorStage
- Guides store type `{ x: SnapGuide[]; y: SnapGuide[] }`; render segments
  with kind colours.
- `getSnapLines(id)` via `buildSnapLines` + viewport from `containerRef`.
- `snapDrag(id, box, evt)` uses `snapMove` + `isSnapBypass`.
- Transformer `boundBoxFunc` live snap; modifier ref; rotation skip.
- Remove end-time `snapResize` from rect, magnify, blur, pin, sticker, image.
- Arrow endpoint + curve handle `snapPoint`; crop move + resize (canvas only).

## Task 6 — e2e visual (`e2e/visual/editor-live-resize-snap.spec.ts`)
- Mid-gesture: rect bottom edge held near another rect's bottom → edge
  already aligned and guide count > 0 *before* release; release → 0.
- Text resize snaps live; arrow head handle snaps; bypass key held → no snap.

## Task 7 — verify + tracker + PR
- L1, L3, L4; PROGRESS-FEATURE.md entry; PR with `needs-owner-test`.
