# CP-0025 — Live magnetic resize, canvas-first snap priority, configurable bypass key

Source: owner ticket (no inbox issue) · Ticket: CP-0025

## Goal

Resizing should feel as magnetic as drag-move: the moving edge sticks to a
target **while the handle is held**, with the guide visible, for every
resizable annotation. When many lines are near, the canvas (outer edge /
centre, image edge / centre) wins. The key that bypasses snapping is a
setting.

## Current state

- Resize snaps once, in each shape's `onTransformEnd` (`snapResize` →
  `snapResizedBox`), and clears its guides immediately — nothing is shown
  while resizing. Text, emoji, pen strokes and arrow handles never snap.
- `snapAxis` / `snapValue` compare with `<=`, so the *last* in-range target
  wins a tie; image targets are pushed first, so an annotation beats the
  canvas on an exact tie. Only one guide per axis is kept.
- Konva's Transformer turns **Alt** into resize-from-centre
  (`centeredScaling() || e.altKey`, `konva/lib/shapes/Transformer.js:553`).
  So today Alt during a resize both centres the resize *and* skips the snap.

## Behaviour

### One snap engine (`src/lib/snap.ts`, pure)

- **Lines.** `buildSnapLines({ canvas, image, others, viewport })` returns
  per-axis `SnapLine { at, kind: "canvas" | "element", lo, hi }` — `lo/hi` is
  the line's extent on the other axis (for guide segments and tie-breaks).
  Canvas lines = `contentBox` edges + centre and image edges + centre (both
  `kind: "canvas"`, extent = the canvas). Element lines = edges + centre of
  every other annotation's AABB **that intersects the visible viewport**
  (`viewport: null` = no pruning). Duplicates (same `at` + kind) collapse.
- **Pick rule** (per axis): candidates are (moving edge, line) pairs with raw
  distance `|d| ≤ threshold`. Score = `|d|`, minus `canvasBonus` for canvas
  lines. Lowest score wins. Scores within `tieEps` are tied → canvas first,
  then the element nearest the dragged box on the other axis, then smaller
  `|d|`. All values are image px: `threshold = 6/scale`,
  `canvasBonus = 2/scale`, `tieEps = 0.5/scale`.
- **Guides.** After the nudge, every line within `tieEps` of a moving edge is
  a guide (so an exact canvas/element tie draws both). Guide =
  `{ at, kind, from, to }`: a segment spanning the dragged box and the target's
  extent. Canvas lines span the whole canvas.
- `snapMove(box, lines, o)` — moving edges = min/centre/max on each axis.
- `snapResize(box, anchor, lines, o)` — `anchor` is the Transformer's active
  anchor name. Edge anchor → only that axis; corner → both. With
  `keepRatio` on a corner, snap the axis with the better score and derive
  the other from the ratio, keeping the opposite corner (or centre) fixed.
  With `centered`, the opposite edge mirrors the nudge. A nudge that would
  drop the size below `minSize` is skipped.
- `snapPoint(p, lines, o)` — an arrow endpoint; each axis snaps its own
  coordinate.
- `isSnapBypass(mods, key, platform)` — `"alt"` → `altKey`, `"mod"` → Cmd on
  macOS / Ctrl elsewhere, `"none"` → never.

### Wiring (`EditorStage.tsx`)

- **Live resize** in the shared Transformer's `boundBoxFunc`: convert the
  absolute box to image space through the layer's absolute transform, call
  `snapResize` with the active anchor, Konva's `keepRatio || shift` (corner
  anchors only, mirroring Konva) and `centered = alt`, convert back, publish
  guides. Konva fits the node to the returned box, so every shape attached to
  the Transformer — rect/ellipse, blur, magnify source, pin, sticker (emoji +
  image), image, **text** and **pen** — snaps live, and its
  `onTransformEnd` simply reads the already-snapped node. The end-time
  `snapResize` calls and the old `snapResizedBox` are removed.
- Modifier state for `boundBoxFunc` (it gets no event) comes from a
  capture-phase window listener on pointer/mouse/key events.
- **Rotated shapes:** if the box rotation is not 0 (mod 360°), skip snapping
  and clear guides — no jump. 90° multiples are skipped too (simplest safe
  rule; see Out of scope).
- **Arrow / line endpoints** snap in the handle's `onDragMove` via
  `snapPoint`; the curve control handle snaps too. Guides clear on drag end.
- **Crop** box: resize (its own Transformer `boundBoxFunc`, `keepRatio`
  off → corners snap both axes) and move snap to **canvas lines only**.
- **Drag-move** uses `snapMove` with the same lines and rule.
- Guides store becomes `{ x: SnapGuide[]; y: SnapGuide[] }`. Rendered as
  segments in the `SCREEN_CHROME` layer (kept out of exports, CP-0079):
  element guides green `#34d399`, canvas guides magenta `#e879f9`.
- CP-0079 clearing stays: guides clear on transform end / drag end / window
  mouseup / blur.

### Setting `general.snapBypassKey`

- `"alt" | "mod" | "none"`. Lives next to `general.snapEnabled` (the ticket
  wrote `editor.` — there is no `editor` config section; Settings → Editor
  is backed by `general`).
- **Default `"mod"` for fresh installs**: Alt clashes with Konva's
  resize-from-centre (verified above), which the Decisions say makes `"mod"`
  the default.
- **Schema v7 → v8**: the migration sets `"alt"` on existing stores that
  don't have the key — existing users keep exactly today's behaviour (the
  acceptance criterion "a v7 config migrates to `alt`"), same pattern as the
  v3 → v4 language step. No Rust reader touches `general.snap*`.
- Settings → Editor: a `<select>` right under the Snap toggle (registry id
  `editor.snapBypass`, `addedIn: "0.20.0"`), labels via `t()` in en + th.
  The Snap hint names the configured key.

## Edge cases

- Typing in fields / canvas text editing: snapping only runs inside Konva
  drag/transform callbacks; the text editor hides the Transformer.
- Crop mode hides the normal Transformer; crop uses its own.
- Desktop vs `/paste`: pure frontend; web falls back to `DEFAULT_CONFIG`
  (`"mod"`).
- Snap off in Settings or bypass key held → no nudge, guides cleared, for
  drag-move, resize, endpoints and crop.
- Highlighter has resize disabled — unchanged.

## Out of scope

- Multi-select (CP-0050), rotation-angle snapping, equal-spacing guides.
- Snapping rotated shapes, including exact 90° multiples.
- Edge-handle resize of uniform-scale shapes (pin/sticker/text middle
  anchors) — they still scale from `scaleX` only, as today.
