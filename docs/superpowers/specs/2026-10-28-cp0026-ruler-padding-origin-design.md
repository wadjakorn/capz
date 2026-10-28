# CP-0026 — Rulers measure the whole exported canvas (padding + overflow)

Source: owner ticket (no inbox issue) · Ticket: CP-0026

## Goal

The rulers label positions in **image coordinates**: with backdrop padding
`P` on, the padded frame's outer edge reads `-P` and the image edge reads `0`.
They should measure the canvas that actually gets exported. Zero sits at the
outer top-left of the exported canvas (`contentBox` origin, which already
includes backdrop padding and annotation overflow), and labels run `0 … W`
where `W` is the exported PNG width (same for the left ruler / height).

## Root cause

`EditorStage` draws the Konva stage — whose top-left is `contentBox` — at
scroll offset `padX/padY`, and passes `originX={contentBox.x}` to `<Rulers>`.
`Rulers` converts scroll position to image space
(`originX + (scroll - pad) / scale`), steps ticks on multiples of `step` in
that space and prints the raw image value. PR #76 only added comments; the
labels never changed.

## Behaviour

- New pure helper `src/lib/rulerTicks.ts`:
  `rulerTicks({ scroll, pad, scale, length })` → `{ minor: number[], major:
  { pos, label }[] }`. Works in canvas coordinates
  `c = (screen + scroll - pad) / scale`; minor/major ticks are multiples of
  `minor` / `step` in that space (so they land on round numbers from the new
  zero), screen position `pos = round(pad + c*scale - scroll) + 0.5`,
  `label = round(c)`. `step = niceStep(50 / scale)`, `minor = max(1, step/5)`
  — unchanged.
- `Rulers.tsx` uses the helper for both axes. Because the stage's top-left
  *is* the canvas origin, the `originX/originY` props are no longer needed and
  are removed (EditorStage stops passing them).
- The misleading "labels stay in image coordinates" comments go.

## Decided defaults

- Zero = outer top-left of the whole exported canvas, counting overflow and
  backdrop padding (owner, 2026-10-28).
- Rulers only; inspector X/Y and other readouts keep their current origin.
- No user-visible strings → no i18n change. No settings → no schema bump.

## Edge cases

- **Backdrop off, no overflow:** `contentBox` = image box, so labels are
  identical to today.
- **Overflow past top/left:** the canvas grows, `padX` still marks its
  top-left, so `0` follows the new outer edge.
- **Zoom/scroll:** same inputs as before (`scroll`, `pad`, `scale`), so the
  ruler stays in sync; the cursor crosshair code is untouched.
- **Typing / text editing / crop mode:** no input path changes.
- **Desktop vs `/paste`:** shared editor; applies to both.

## Out of scope

Snapping, stage/padding layout, export, stored annotation coordinates.
