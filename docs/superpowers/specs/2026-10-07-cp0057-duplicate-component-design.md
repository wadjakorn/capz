# CP-0057 — Duplicate the selected canvas component

Follow-up to [capz-inbox#9](https://github.com/wadjakorn/capz-inbox/issues/9)
(owner decision). Ticket CP-0057.

## Goal

Let the user duplicate the selected annotation ("component") on the editor
canvas with **⌘D / Ctrl+D** or a **Duplicate** button, in both the desktop
editor and the `/paste` web editor.

## Current state

- Annotations live in `useEditor.annotations` (`src/stores/editor.ts`). Array
  position **is** z-order: later index draws on top, index 0 sits just above the
  base screenshot (`reorderAnnotations`).
- Every mutating store action snapshots `{annotations, nextPinNumber,
  imageCrop}` onto `past` — one call = one undo entry.
- Selection is single: `selectedId`. There is no multi-select.
- `shiftAnnotation(a, dx, dy)` (private, `editor.ts`) already translates every
  annotation type's positional fields (used by crop).
- Selection-contextual controls live in the right-docked tool-options panel
  (`ToolOptionsPanel.tsx`): a shared **stacking-order footer** (four icon
  buttons) renders for any selected annotation; `Toolbar.tsx` builds its props.
  Both `/editor` and `/paste` render the same `Toolbar` and call the same
  `useEditorShortcuts()` hook.
- There is no in-app shortcut cheatsheet. `src/lib/shortcuts.ts` holds the
  *global* (OS-level) hotkey helpers; in-editor shortcuts are surfaced through
  button tooltips that use `formatShortcut()` (e.g. `ExportSplitButton`).
- ⌘C copies the whole rendered canvas; ⌘V pastes an OS clipboard image as an
  overlay. Both are left untouched.

## Design

### Behaviour

| Aspect | Decision |
|---|---|
| Trigger | ⌘D (mac) / Ctrl+D (Windows, web). `preventDefault()` on every ⌘/Ctrl+D the editor handles, so browsers never open the bookmark dialog. Shift/Alt variants are ignored. |
| Inactive when | focus is in an `input`/`textarea`/contentEditable (already filtered by `isTypingTarget`, which also covers on-canvas text editing — that is a `<textarea>` overlay); the **crop** tool is active; nothing is selected. Inactive = no-op (the keystroke is still swallowed outside inputs). |
| New id | `uid()` |
| Offset | +10, +10 image px. Per axis, if the copy's bounding box would run past the working image's right/bottom edge **and** flipping fits, use −10 on that axis instead. If the image size is unknown or the element is larger than the image, keep +10 (the canvas already grows to show overflowing elements). |
| Z-order | Inserted **directly above the original** (index + 1), not at the top. Array position is z-order, so this keeps the copy in the same stacking context as its source — e.g. a box that sits under a blur stays under it — which is what Figma/Keynote/Slides do. Repeating ⌘D on the copy puts the next copy directly above *it*, so a chain still reads bottom→top in creation order. |
| Selection | The copy becomes `selectedId`. Repeated ⌘D therefore offsets from the latest copy (+10, +20, +30…). |
| Undo | One undo entry per duplicate (snapshot taken before the insert). Undo removes the copy and restores `nextPinNumber`. |
| Deep clone | `structuredClone` the source, then translate. No arrays/objects (pen `points`, image `crop`) are shared with the original. |
| Overlay images | `ImageAnnotation.src` is a `data:` URL (every `addOverlayImage` caller passes one) — immutable and never revoked. The copy **shares the same string**; no bitmap is re-encoded and no object URL is created, so nothing can leak. (Undo snapshots already share these strings the same way.) The per-object `crop` is cloned. |
| Numbered pins | The copy takes **`nextPinNumber`** and advances it, exactly like dropping a new pin, and persists `pins.lastUsedNumber` like `EditorStage` does. Pins are step markers; two "3"s would be ambiguous, and a duplicated pin is almost always "the next step, styled like this one". Style (colour, shape, size, tail, label style) is copied. |
| Non-duplicable types | None today. Crop is a tool mode, not an annotation, and is handled by the crop-mode guard. The store action still returns `null` for an unknown id. |
| Scope | Single selection only. |

### Code shape

- **Store** (`src/stores/editor.ts`):
  - `cloneAnnotation(a, id, dx, dy): Annotation` — exported pure helper:
    `structuredClone` + existing `shiftAnnotation`.
  - `duplicate(id, delta = {dx: 10, dy: 10}): string | null` — new action.
    Clones, inserts at `index + 1`, pin gets `nextPinNumber` and advances it,
    pushes one history snapshot, clears `future`, selects the copy, returns the
    new id.
- **Helper** (`src/lib/duplicate.ts`):
  - `DUPLICATE_OFFSET = 10`, `DUPLICATE_SHORTCUT = "CmdOrCtrl+D"`.
  - `duplicateOffset(aabb, bounds)` — pure per-axis flip rule above.
  - `duplicateSelected(): string | null` — the single entry point used by the
    shortcut and the button: guards crop mode / no selection, reads the image
    size from `stageBridge.getStageImageSize()`, computes the delta from
    `annotationAABB`, calls `duplicate`, persists `pins.lastUsedNumber` for a
    pin copy.
  - `canDuplicate(state)` — selection present and tool ≠ crop (drives the
    button's enabled state).
- **Shortcut** (`src/hooks/useEditorShortcuts.ts`): one self-contained block
  next to the other ⌘-combos, calling `duplicateSelected()`.
- **UI** (`ToolOptionsPanel.tsx` + `Toolbar.tsx`): a `CopyPlus` icon button
  in the existing selection footer, after the stacking-order group, separated by
  a thin divider. Same 28px icon-button style as the reorder buttons. Tooltip /
  `aria-label` = "Duplicate (⌘D)" / "ทำสำเนา (Ctrl+D)" via `formatShortcut`.
  The footer only renders while something is selected and is hidden in crop
  mode (`hasContext` excludes crop), so the button is never visible in a state
  where it would be a no-op.
- **i18n**: `editor.duplicate` = "Duplicate ({shortcut})" / "ทำสำเนา ({shortcut})"
  (en + th), and a GLOSSARY row (duplicate → ทำสำเนา).

### Out of scope

- Multi-select duplicate, Alt-drag duplicate, copy/paste of annotations via the
  clipboard.
- Changing ⌘C / ⌘V.

## Acceptance

- Select any annotation type → ⌘D / Ctrl+D (or the button) adds a copy offset
  by 10 px, directly above the original, selected. Repeat → each copy offsets
  from the previous one.
- One ⌘Z removes the copy; ⇧⌘Z restores it.
- A duplicated pin shows the next number; the following placed pin continues
  after it.
- Pen/highlighter copies can be edited without affecting the original.
- ⌘D while typing in a text field, editing text on the canvas, in crop mode, or
  with nothing selected does nothing (and never opens a browser bookmark
  dialog outside text fields).
- ⌘C / ⌘V behave exactly as before.
- `pnpm test:unit`, `pnpm exec tsc --noEmit`, `pnpm build` pass.
