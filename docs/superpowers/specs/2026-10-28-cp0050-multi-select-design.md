# CP-0050 — Multi-select annotations (Cmd/Ctrl-click + marquee)

Source: owner ticket (no inbox issue), refined with the owner 2026-10-28 · Ticket: CP-0050

## Goal

Select several annotations at once, like a native file manager, then move,
nudge, delete or restyle them together. Today selection is a single id.

## Behaviour

### Building a selection (Select tool only)

- **Plain click** on an annotation selects only it. Exception (OS-style): a
  plain press on a member of a 2+ selection keeps the group so it can be
  dragged; if the press ends without a drag, the selection collapses to that
  annotation.
- **Cmd-click (macOS) / Ctrl-click (Windows/Linux)** toggles the annotation in
  or out of the selection (`currentPlatform()` from `src/lib/shortcuts.ts`
  decides which key). Shift is not a selection modifier.
- **Marquee:** a press on empty canvas with the Select tool deselects (as
  today) and starts a drag rectangle. On release, every annotation whose
  `annotationAABB` lies **fully inside** the rectangle is selected. Cmd/Ctrl
  + marquee keeps the current selection and adds to it. A click without a
  drag (< 3 screen px) just deselects, as before.
- The marquee is drawn in the `screen-chrome` layer (CP-0079), so it never
  reaches an export, and it is not started in drawing tools, crop mode, OCR
  mode, while a text editor is open, or by a second touch contact.

### Acting on a selection (2+ members)

- **Drag** any member: the whole group moves. Snapping uses the group's
  combined AABB and ignores every member as a target; Alt turns it off. On
  release, one `moveMany` call → one undo step. Arrows, pins, text, pen,
  highlighter and magnifiers (source *and* lens) move by the same delta.
- **Delete / Backspace** → `removeMany`, one undo step.
- **Arrow keys** nudge the group (Shift = 10 px); a run of nudges coalesces into
  one undo step (`nudgeMany`, coalescing keyed on the id set).
- **Esc** clears the selection (and leaves a drawing tool, as for one item).
- **Style panel:** if every member has the same type (arrows and headless lines
  count as different types — they have different panels) the panel shows the
  primary member's values and every edit applies to all members via
  `updateMany`, one undo step. Mixed types: no style controls; the panel shows
  "N items selected" plus a translated hint that styles need the same type.
- Z-order, duplicate (Cmd+D) and element copy (Cmd+C) are deferred: with 2+
  selected the z-order/duplicate controls are hidden and Cmd+D is a no-op;
  Cmd+C copies the whole image as it does with no selection.

### Selection chrome

- One member: unchanged (box Transformer, arrow inline handles).
- 2+ members: the box Transformer is detached (no group resize/rotate, and it
  avoids Konva's built-in multi-node drag, which would fire every member's own
  drag handlers and create one undo entry each). Each member gets a thin
  dashed outline of its AABB in the `screen-chrome` layer; arrows included.

## Store model (`src/stores/editor.ts`)

- `selectedIds: string[]` — ordered; the last entry is the primary.
- `selectedId: string | null` stays as a stored mirror: the id when exactly one
  is selected, else `null`. Every action writes both through one helper, so
  single-select callers (crop target, duplicate, element copy, autosave guard
  extended to `selectedIds`) keep working.
- New actions: `toggleSelect(id)`, `selectMany(ids)`, `removeMany(ids)`,
  `moveMany(ids, dx, dy)`, `nudgeMany(ids, dx, dy, now?)`,
  `updateMany(ids, patch)`. Each mutating one pushes exactly one history
  snapshot and uses `shiftAnnotation` for geometry.
- Marquee hit-test: `annotationsInRect(list, rect)` in
  `src/lib/annotationBounds.ts` (full containment of `annotationAABB`).

## Decided defaults (with the why)

- Full containment, Cmd/Ctrl modifier, same-type style editing — owner, 2026-10-28.
- Per-member outlines instead of one Transformer border — Konva's multi-node
  Transformer drags every attached node itself; that would bypass group
  snapping and produce N undo entries.
- Mixed-type panel shows a hint *instead of* greyed controls — there is no
  single control set to grey out across different types.
- Magnifier dragged by one part: the other part of *that* magnifier catches up
  on release (other members follow live). Kept simple; noted for owner test.
- No persistence, no settings → no `CONFIG_SCHEMA_VERSION` bump.

## Edge cases

- **Typing in fields / canvas text editing:** shortcuts already skip typing
  targets; a press on empty canvas while a text editor is open still just
  commits the text (no marquee).
- **Crop mode:** `setTool("crop")` keeps the selection; crop targets an image
  only when exactly one is selected (`selectedId`). No marquee in crop.
- **Tool switch / undo / redo / hydrate / applyCrop:** clear `selectedIds`.
- **Removed member** (undo, delete): ids not in `annotations` are ignored.
- **Desktop vs `/paste`:** shared editor; works in both. Cmd vs Ctrl comes from
  `currentPlatform()`.
- **Touch:** a second contact never starts a marquee (`isGestureContact`).
- **Export:** `prepareExport` already selects `null`; outlines and marquee live
  in `screen-chrome`, which is hidden during every snapshot.

## Out of scope

Group resize/rotate, align/distribute, multi duplicate/copy/paste, multi
z-order, layers panel.
