# CP-0065 — WYSIWYG canvas text editor

From [capz-inbox#16](https://github.com/wadjakorn/capz-inbox/issues/16)
(owner-accepted). Ticket CP-0065.

## Goal

While a text annotation is being typed or re-edited, the on-canvas editor sits
exactly where the committed Konva text renders and looks the same — no jump
down while editing and back up on commit, no style change on commit. Desktop
editor and `/paste` (both host the shared `EditorStage`).

## Current state

`EditorStage.tsx` renders a `position: fixed` `<textarea>` at the raw
click/double-click point (`screenX/screenY`). Its style diverges from
`TextShape`:

- font size `Math.max(14, fontSize × scale)` (14px floor),
- fixed `padding: 4` / `8px 12px`, `borderRadius: 10` instead of the shape's
  `padX = bgPadding`, `padY = round(padX × 0.66)` and derived corner radius,
- dark `rgba(20,20,20,0.92)` fallback background when the text has none,
- a 2px dashed border that pushes the content box down/right,
- `minWidth: 140`, `minHeight`,
- re-editing a text without a background falls back to the *tool's* background
  (`editing.backgroundColor === undefined` → `toolsCfg.text.backgroundColor`),
  unlike `TextShape` (`a.backgroundColor ?? null`),
- rotation ignored; the Konva node stays visible underneath (double image);
- `position: fixed` with a screen point captured once, so scrolling or zooming
  while editing leaves it behind.

## Design

### One layout, two renderers

New pure module `src/lib/textLayout.ts`:

- `measureTextInk` moves here unchanged (canvas `measureText`).
- `textBoxLayout(a: TextAnnotation)` returns everything `TextShape` needs:
  `padX, padY, innerW, innerH, w, h, cornerRadius, bg, fontStyle, fontFamily,
  textDecoration, align, lineHeight`. `TextShape` is rewritten to use it, so
  the numbers can never drift apart again.
- `textEditorOverlay(layout, scale)` maps that layout to the overlay's CSS
  numbers in screen px: box `w·s × h·s`, radius `r·s`, text block at
  `(padX·s, padY·s)` with font size `fontSize·s`, unitless `line-height`,
  plus a small caret slack (below).

### Overlay structure

The overlay moves **inside the stage's positioned wrapper** (the
`left: padX, top: padY` div that holds `<Stage>`), absolutely positioned at
`((x − contentBox.x)·scale, (y − contentBox.y)·scale)`. It therefore scrolls
and zooms with the canvas instead of using a captured screen point.

```
<div box>            ← exact node box: w·s × h·s, background, radius,
                       outline (affordance, no layout), rotate(deg) with
                       transform-origin 0 0 (Konva Group rotates about x,y)
  <textarea>         ← transparent, no border/padding, white-space: pre,
                       overflow hidden, at (padX·s, padY·s), width innerW·s
                       + caret slack
```

- **Box** matches the Konva Group's client rect, so the e2e can compare rects.
- **Glyph baseline:** Konva draws each line at `lineHeightPx/2 +
  (fontAscent − fontDescent)/2`; CSS places the baseline at half-leading +
  ascent, which is the same expression — so glyphs line up for Latin and Thai
  with the same font stack.
- **Caret slack** (2 px): a textarea exactly as wide as its text scrolls by a
  pixel when the caret sits at the end. The textarea is widened by the slack
  and shifted left by 0 / slack/2 / slack for left / center / right align, so
  the glyphs stay put; the box (background) is unaffected.
- **Affordance:** `outline: 1px dashed` in the text colour with a 2px offset
  — `outline` never affects layout.
- **No minimums:** at tiny zoom the overlay is tiny, like the result
  (Decision). An empty new text measures as a single space.
- **The edited Konva node is hidden** (`visible={false}`) while its editor is
  open and shown again on commit/cancel; the Transformer is detached while
  editing so its handles don't frame a stale box.

### Values

The overlay renders a `TextAnnotation`: the edited one with `text` replaced by
the live value, or — for new text — the same draft `commitTextEditor` would
add (tool settings at the click point). One helper builds that draft for both,
which also fixes the re-edit background fallback.

## Decided defaults

- Zoom-independent committed size; only the overlay follows zoom (Decision).
- Commit keys unchanged: Enter commits, Shift+Enter newline, Esc cancels,
  blur commits.
- No new user-visible strings.

## Edge cases

- **Typing in fields / shortcuts:** the textarea is still an input, so the
  existing typing guards in `useEditorShortcuts` apply unchanged.
- **Crop mode:** text tool is not active in crop mode; unchanged.
- **Zoom while editing:** overlay re-renders from `scale`, stays aligned.
- **Rotated text:** overlay rotates with it.
- **Underline:** CSS and Konva underline offsets differ by a pixel or so;
  acceptable (out of scope to unify).
- **Desktop vs `/paste`:** same component, no platform branch.

## Verification

- Unit: `textBoxLayout` (padding/radius/no-bg), `textEditorOverlay` at scale 1
  and 0.5 (box, font size, offsets, slack per align).
- e2e (`e2e/web`): place text, type, read the overlay box rect, commit, read
  the committed Konva node's client rect → equal within 2 px; repeat at a
  non-1 zoom; re-edit hides the node.
- L4 visual: before/while/after snapshots.

## Out of scope

Rich text, new styling options, commit-key changes.
