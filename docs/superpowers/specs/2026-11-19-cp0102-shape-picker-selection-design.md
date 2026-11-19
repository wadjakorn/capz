# CP-0102 — Shape picker stays visible while a shape is selected

> Status: **v1** · Card: CP-0102 · Source: capz-inbox#20

## Goal

Selecting a rectangle hid the Shapes sidebar's shape picker (rect / circle / line); it only
came back after re-picking the Shapes tool in the top bar. Users read that as a bug. Show the
picker for a selected shape and let it switch rectangle ↔ circle in place.

## Behaviour

| Selection | Picker | Highlighted | Enabled | Click effect |
|---|---|---|---|---|
| nothing (Shapes tool) | shown | tool default | all | sets the default (unchanged) |
| one rect / ellipse | shown | its shape | Rectangle, Circle | sets `shape` on it **and** the default |
| several rects/ellipses | shown | primary member's shape | Rectangle, Circle | sets `shape` on every member, one undo entry, and the default |
| one / several Shapes lines | shown | Line | Line | nothing (already a line) |
| boxes + lines mixed | hidden (whole style panel is already the "mixed" hint, CP-0050) | — | — | — |

- Rectangle and circle are both `type: "rect"` annotations; only `shape` differs, so the
  switch keeps x/y/w/h, rotation, colour, width, line style, corner radius and dim.
  The corner-radius control appears for rectangles only, as today.
- A line is a headless `arrow` (2-point segment). It cannot become a box and back. The
  unavailable options stay visible but **disabled** (`aria-disabled`, faded, click ignored)
  so the panel does not jump, with a tooltip:
  - box selected → Line: "Can't turn a box into a line — draw a new one"
  - line selected → Rectangle/Circle: "Can't turn a line into a box — draw a new one"
  `aria-disabled` rather than `disabled` so the tooltip still shows on WebKit/WebView2.
- The highlighted shape is what is **rendered**: a rect annotation with no `shape` draws as
  a rectangle, so it reads as "rect" (previously the code fell back to the tool default).
- A shape pick on a selection is remembered for the next drawing via the same
  lastUsed / settings path the tool-mode picker uses.

## Decided defaults (owner-approved via ticket)

- One shape change = one undo entry (`updateMany` / `update` each push one history entry).
- No new persisted setting → no `CONFIG_SCHEMA_VERSION` bump.
- Disabled options stay visible.

## Edge cases

- Typing in a field / canvas text editing / crop mode: the picker is a click target only, no
  shortcut is added, so no guard changes.
- Desktop and `/paste` share `Toolbar` + `ShapesPanel`; no platform branching.

## Out of scope

Converting line ↔ box; pins and arrows.
