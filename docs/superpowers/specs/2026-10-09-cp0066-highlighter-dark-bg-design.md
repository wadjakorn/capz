# CP-0066 — Keep the highlighter bright on dark backgrounds

Source: capz-inbox#15 (v0.17.1, macOS arm64). Ticket CP-0066.

## Goal

A highlighter stroke must read as a highlight on any background. Today it is
nearly invisible on dark surfaces (dark-mode UIs, terminals).

## Current state

The highlighter draws with `globalCompositeOperation="multiply"` in two places
in `src/components/editor/EditorStage.tsx`: the live draft `<Line>` and
`HighlighterShape`. Default colour `#facc15` at opacity 0.5
(`src/lib/config.ts`). Multiply can only darken: over black it yields black.

## Design

Per stroke, pick one of two blend modes from the base image under it:

| Area under the stroke | Mode | Result |
|---|---|---|
| light (mean luminance ≥ 0.5) | `multiply` (as today) | dark text stays crisp, paper turns the highlight colour |
| dark (mean luminance < 0.5) | `screen` | light text stays light, the dark background is tinted with the highlight colour |

- **Sampling.** `src/lib/highlightBlend.ts` builds a small luminance grid of
  the base image once per bitmap (long side ≤ 256 cells, cached in a
  `WeakMap` keyed by the image element) and averages the cells under the
  stroke's bounding box (points ± half the stroke width), in source-image
  pixels — so it is zoom-independent and cheap enough to rerun on every
  pointer move of the draft. Luminance = Rec. 709 weights on the 0–1 encoded
  channel values; transparent pixels count as white (the multiply default).
  Only the base image is sampled, not other annotations.
- **Where.** A `useHighlightBlend` hook in `EditorStage.tsx` feeds the same
  computation to the draft stroke and to `HighlighterShape`, so the preview,
  the committed shape, and the exported PNG (exported from the same Konva
  stage) agree. Desktop editor and `/paste` share `EditorStage`.
- **Moves.** The stroke's points are already rewritten on drag end, arrow-key
  nudge, crop shift and undo/redo; the mode follows them because it is
  derived from the points. A drag stays one history entry (nothing new is
  written to the store).
- **Image crop.** The bounding box is offset by the crop origin
  (`cropOffX/Y`, as blur does) before sampling.
- **No image / box outside the image / grid unavailable** → `multiply`.

### Deviation from the proposal: derived, not stored

The proposal suggested storing the chosen mode on the annotation so export and
reload match the screen. The mode is a pure function of (base image, stroke
points, stroke width, crop origin), all of which are already persisted, so it
is recomputed identically on reload and export. Storing it would add a second
source of truth that every geometry-changing path (drag, nudge, crop shift,
duplicate, undo) must keep in sync, for no behavioural gain. No annotation
field is added; older workspaces need no handling.

### Per-stroke vs per-pixel

Per-stroke (the ticket's recommendation, accepted with the ticket). A stroke
crossing light and dark areas uses the majority. Per-pixel blending is out of
scope.

## Decided defaults

- Threshold 0.5. Exactly 0.5 → multiply (a mid-grey `#808080` is 0.502 →
  multiply).
- No settings key → no `CONFIG_SCHEMA_VERSION` bump.
- No user-visible string → no i18n change.

## Edge cases

- Typing in fields / canvas text editing / crop mode: untouched (rendering
  only).
- Base image still loading on reload: no image → multiply until it loads,
  then the mode updates with it.
- Stroke drawn in the backdrop padding outside the image → multiply.

## Out of scope

New highlighter colours/presets, a user-facing blend-mode setting, per-pixel
blending.

## Tests

- Unit (`src/lib/highlightBlend.test.ts`): black → screen, white → multiply,
  mid-grey → multiply, mixed region (mostly dark → screen, mostly light →
  multiply), box outside the image → multiply, crop offset, transparent pixels.
- Visual (L4, `e2e/visual/editor-highlighter-dark.spec.ts`): yellow stroke
  over a black image renders bright (sampled stage pixel well above black);
  over a white image it still renders as multiply yellow.
