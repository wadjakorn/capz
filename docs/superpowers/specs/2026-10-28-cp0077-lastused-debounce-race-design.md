# CP-0077 — Tool options picked right after drawing are no longer overwritten

Source: owner ticket (no inbox issue) · Ticket: CP-0077

## Goal

With "remember last tool" on, drawing a shape schedules a 500 ms debounced
`lastUsed` write carrying every remembered field of that shape. A Toolbar pick
made inside that window (e.g. Shapes → Circle) is written immediately, then
undone when the debounced flush merges the drawn shape's fields over it. The
Toolbar pick must win.

Repro (`/paste`): Shapes → draw a rect → within 0.5 s Esc → pick Circle →
draw → a rect is drawn.

## Root cause

`pendingLastUsed` and its timer were local to `EditorStage`, so the Toolbar's
immediate `patchLastUsed` had no way to tell the pending write that a field had
since been chosen explicitly. `patchLastUsed` also merged against the
render-time `fullConfig` instead of the live store.

## Behaviour

- New module `src/lib/lastUsedWriter.ts` owns the pending patch and timer:
  - `scheduleLastUsed(patch)` — merges `patch` into the pending patch
    (slot-replacing, as before) and (re)starts the 500 ms timer. The flush
    keeps today's merge logic verbatim: live `tool` (crop falls back to the
    stored tool), the `stickerEmoji` fallback chain, per-slot spread merge.
  - `dropPendingLastUsed(patch)` — for every `slot.field` in `patch`, deletes
    that field from the pending slot; for top-level scalar keys, deletes the
    key. Untouched slots and other fields in the same slot still flush.
  - `cancelLastUsed()` — clears the timer and pending patch.
  - `writeLastUsedNow(patch)` — the Toolbar path: `dropPendingLastUsed(patch)`
    then merge `patch` into `useSettings.getState().config.lastUsed` and
    `setLastUsed`. Toolbar's `patchLastUsed` delegates to it.
- `EditorStage` keeps its `rememberLastTool` guard and calls
  `scheduleLastUsed`; its unmount cleanup calls `cancelLastUsed` (same as
  clearing the timer before; the pending patch was discarded with the ref).

## Decided defaults

- "Strip pending keys" over compare-and-set (owner decision): no per-field
  snapshot, correct even when a value changes and changes back in the window.
- `lastUsed` shape unchanged → no `CONFIG_SCHEMA_VERSION` bump.
- No user-visible strings → no i18n change.

## Edge cases

- **Typing in fields / canvas text editing:** Toolbar text options go through
  `patchLastUsed`, so they are protected the same way.
- **Crop mode:** flush still never persists `tool: "crop"`.
- **Selected-shape edits:** a Toolbar pick on a selected shape updates the
  annotation and schedules through `onChange`/`patchLastUsed` as before; the
  last caller wins, which matches the user's latest action.
- **Desktop vs `/paste`:** shared editor; on web `setLastUsed` only updates the
  in-memory store, which is what the next draw reads.
- **Module-level state:** one editor stage per webview, so a singleton pending
  patch is equivalent to the old ref.

## Out of scope

Overlay `region` cross-window clobbering, the non-remember
`updateSettings("tools", …)` path, changing the 500 ms interval.
