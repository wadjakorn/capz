# CP-0079 — Clear green snap guides after resize; never bake them into exports

Source: capz-inbox#18 · Ticket: CP-0079

## Goal

The green (`#34d399`) snap/alignment guides sometimes stay on screen after an
edit and end up in the saved/copied image. Only dragging an element again
clears them. Guides are screen-only chrome: they show while a gesture is in
progress and never appear in any export.

## Root causes

1. **Resize leaves guides behind.** Every resizable annotation snaps once, in
   `onTransformEnd`, via `ctx.snapResize(...)`, which calls
   `setGuides(hit.guides)`. Nothing clears them afterwards (drag paths call
   `ctx.endSnap()` in `onDragEnd`; resize paths don't). A snapped resize
   therefore leaves its guide drawn until the next drag. Resize snapping only
   happens at commit time, so there is no live phase in which those guides help.
2. **Export races React.** `prepareExport` clears guides with
   `setGuides({x:[],y:[]})`, which only takes effect on the next React render.
   `Toolbar.doExport` / the context-menu copy call `runPrepareExport()` and
   then immediately `stage.toDataURL`, so the still-mounted guide `Line`s get
   baked into the PNG.

## Behaviour

- `snapResize` still snaps the committed box, but clears guides instead of
  drawing them (resize has no live phase → nothing to show).
- The guide `Layer` is named `screen-chrome`. Every stage snapshot —
  `exportRegion()` (save, copy, save+copy, context-menu copy, template
  apply/save previews that go through `runPrepareExport` + export) and the
  workspace thumbnail — runs inside `withScreenChromeHidden(stage, fn)`, which
  hides every visible `.screen-chrome` node synchronously for the duration of
  `toDataURL` and restores it afterwards. Export no longer depends on React
  timing.
- Defensive clearing — guides are also cleared when:
  - the pointer is released anywhere (`window` `mouseup` / `touchend` /
    `touchcancel`, after Konva's own drag/transform end handlers) or the
    window loses focus (`blur`) — covers gestures aborted outside the window;
  - the tool changes (`setTool`), on undo / redo (store), and on workspace
    switch / reset (`hydrate` / `reset` already did this).

## Decided defaults

- Snap behaviour, thresholds, colours and the rulers feature are unchanged
  (out of scope per the proposal).
- The `screen-chrome` name is reusable for future screen-only layers.
- No user-visible strings → no i18n change. No settings → no
  `CONFIG_SCHEMA_VERSION` bump.

## Edge cases

- **Typing in fields / canvas text editing:** unaffected — no keyboard path
  changes.
- **Crop mode:** the crop rect has its own Transformer and never calls
  `snapResize`; the pointer-release clear is harmless there.
- **Desktop vs `/paste`:** the editor is shared; the fix applies to both.
- **Mid-drag export** (e.g. a shortcut fired while dragging): guides are
  hidden by `withScreenChromeHidden` regardless of store state.
- **toDataURL throws** (tainted canvas): visibility is restored in `finally`.

## Out of scope

Snap thresholds/targets, guide colour, rulers, showing live guides during a
resize.
