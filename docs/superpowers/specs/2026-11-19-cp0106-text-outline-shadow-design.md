# CP-0106 — Text tool: outline (stroke) and shadow

> Status: **v1** · Card: CP-0106 · Source: owner request 2026-11-18 (competitive research
> `docs/research/awesome-screenshot.md`, P1-3), not from capz-inbox

## Goal

Text placed on a busy screenshot is hard to read. Give a text annotation two
readability effects: an **outline** around the glyphs and a **drop shadow**.

## Behaviour

The Text panel gets two new sections below **Background**. They show only while a
text annotation is selected (see "Decided defaults").

| Control | Off | On |
|---|---|---|
| **Outline** toggle (`Outline off` / `Outline on`) | no stroke | stroke in the chosen colour, colour swatch + **Width** slider 1–8 px appear |
| **Shadow** toggle (`Shadow off` / `Shadow on`) | no shadow | preset soft drop shadow |

- Data, per shape (`TextAnnotation`):
  - `outlineColor?: string | null` — absent/null = no outline (same pattern as `backgroundColor`).
  - `outlineWidth?: number` — visible outline thickness in image px, clamped 1–8; absent = 3.
  - `shadow?: boolean` — absent/false = no shadow.
- Rendering (Konva `Text`): `stroke = outlineColor`, `strokeWidth = 2 × outlineWidth`,
  `fillAfterStrokeEnabled = true`, `lineJoin = "round"`. Konva strokes centred on the glyph
  edge; drawing the fill on top hides the inner half, so the visible outline is exactly
  `outlineWidth` and the glyph shape (Thai vowels and tone marks included) is not eaten into.
  Round joins avoid miter spikes on sharp Thai/Latin corners.
- Shadow preset, scaled with the font so it looks the same at 16 px and 96 px:
  colour `#000000`, opacity 0.55, blur `max(2, round(fontSize × 0.12))`,
  offset x = y = `max(1, round(fontSize × 0.05))`.
  Applied to the Text node only, never to the background box, so a filled label keeps
  crisp edges.
- **WYSIWYG while typing** (CP-0065): the editing textarea mirrors both effects with CSS:
  `-webkit-text-stroke: (2 × outlineWidth × scale)px <colour>`, `paint-order: stroke fill`,
  and `text-shadow` with the same preset at screen scale.
- Works with the background-box option (outline/shadow draw over the box).
- Undo: each toggle / colour / width change is one `updateAnnotation` = one history entry.
- Workspaces, templates, copy/paste and duplicate keep the fields because they copy the
  whole annotation object.
- The outline colour swatch remembers the last colour picked this session (like the
  background swatch's `lastBgColor`); default `#000000`.

## Decided defaults (owner-approved via ticket)

- **Per-shape only, not persisted.** The ticket's preferred default. No new keys in
  `config.json`, so no `CONFIG_SCHEMA_VERSION` bump. Because the tool defaults for new text
  come from persisted settings, the outline/shadow controls are hidden when the Text tool is
  active with nothing selected — there is nothing for them to write to. New text starts
  plain; select it to add an outline or shadow.
- Default outline width 3 px; default outline colour black (white text with a black outline
  is the common "meme caption" look and reads on any background).
- Strings via `t()` in `en` and `th`; Thai term for text outline = เส้นขอบ (glossary).
- Thai legibility check: an L4 visual snap of "ที่นี่ น้ำ ปั๊ม" at 48 px with outline 8 px on
  and with shadow, plus a pixel assertion that the outline colour appears around the glyphs
  and the fill colour is still present (the fill is not swallowed).

## Edge cases

- Typing in a field / canvas text editing / crop mode: no shortcut added → no guard change.
  Toggling while the text is being edited isn't possible (panel shows the selected shape;
  editing hides it), the overlay picks the fields up from the existing annotation.
- Outline wider than the background padding: the outline may touch the box edge; accepted.
- No background: the outline extends `outlineWidth` px past the text's layout box, so the
  selection frame sits slightly inside the outline. Accepted (≤ 8 px).
- Desktop editor and `/paste` share `Toolbar` + `TextPanel` + `EditorStage`; no platform
  branching.
- Old annotations without the fields render exactly as before.

## Out of scope

Persisting outline/shadow as tool defaults; custom shadow colour/offset/blur; outline or
shadow for pins, stickers or other shapes.
