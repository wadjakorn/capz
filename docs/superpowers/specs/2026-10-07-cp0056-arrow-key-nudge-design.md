# CP-0056 — Arrow-key nudge for the selected element

## Goal

When an annotation is selected in the editor, the arrow keys move it:
**Arrow = 1 px, Shift+Arrow = 10 px**. Source: anonymous feedback
[capz-inbox#9](https://github.com/wadjakorn/capz-inbox/issues/9) (v0.15.0,
Windows). Applies to the desktop editor and the `/paste` web editor, which
share `useEditorShortcuts` and the `useEditor` store.

## Current state

- Editor keyboard handling lives in one window `keydown` listener,
  `src/hooks/useEditorShortcuts.ts`. It already bails on typing targets
  (`isTypingTarget`: INPUT / TEXTAREA / contentEditable) and on any
  Cmd/Ctrl-modified key that it does not own. Delete/Backspace on
  `selectedId` is the model for a selection-scoped key.
- The arrow keys are unbound today; when the canvas viewport can scroll they
  scroll it.
- `src/stores/editor.ts` keeps undo as whole-document snapshots in `past`
  (`pushHistory`, limit 100); every mutating action (`add`, `update`,
  `remove`, `reorder`, `clear`, `applyCrop`, `applyImageCrop`, `undo`,
  `redo`, `hydrate`) replaces the `annotations` array.
- The store already has a private `shiftAnnotation(a, dx, dy)` used by
  `applyCrop`. It translates exactly the fields a mouse drag changes:
  arrow `x1,y1,x2,y2` (+ `cx,cy` when set), pen/highlighter `points`,
  magnify `sx,sy,x,y`, everything else `x,y`. This matches the per-type
  `onDragEnd` handlers in `EditorStage.tsx` (rect/text/sticker/pin/blur/image
  commit node `x,y`; arrow and pen/highlighter add the drag delta to their
  geometry).
- Annotation coordinates are image pixels in the (possibly cropped) working
  image, independent of `displayScale`.
- On-canvas text editing is a focused `<textarea>` overlay, so it is already a
  typing target.
- There is **no in-app editor shortcut cheatsheet** (the only shortcut lists
  are the global-hotkey rows in Settings and README "Default Hotkeys", which
  cover OS-level capture hotkeys, not editor keys). Nothing to update there.

## Design

### Key mapping (`src/lib/nudge.ts`, new, pure)

`nudgeDelta(key, shift) → { dx, dy } | null` for `ArrowLeft/Right/Up/Down`
(case-insensitive, so the hook's lowercased `key` works). Step is
`NUDGE_STEP = 1`, `NUDGE_STEP_LARGE = 10` with Shift. Any other key → `null`.

### Store action `nudge(id, dx, dy, now?)` (`src/stores/editor.ts`)

- Translates the annotation with the existing `shiftAnnotation` (exported so
  it is tested directly) — the same field semantics as a mouse drag, for
  every annotation type including arrows/lines, pen, highlighter, magnify
  (source + loupe move together, as in crop) and layered images. No clamping
  to the image bounds (a drag does not clamp either). Unknown id or
  `dx = dy = 0` → no-op.
- Units are image pixels, so the step is independent of on-screen zoom.

### Undo coalescing

A run of nudges collapses into **one** undo entry. The store keeps a
transient, non-persisted marker:

```ts
nudgeRun: { id: string; at: number; annotations: Annotation[] } | null
```

`nudge` pushes a history snapshot **only when it starts a new run**. It
continues the existing run (no push) when all of:

1. `nudgeRun.id === id` — same element;
2. `nudgeRun.annotations === annotations` (reference equality) — the document
   is exactly what the previous nudge produced, i.e. *no other edit, undo,
   redo, crop, workspace hydrate, etc. happened in between*;
3. `now - nudgeRun.at <= NUDGE_COALESCE_MS` (1000 ms) — the run is still warm.

After every nudge the marker is refreshed (`at = now`, `annotations = next`).
`future` is cleared as for any edit.

Why this shape:

- **Reference check instead of resetting the marker in every action.** Every
  history-touching action already replaces `annotations`, so identity is a
  free, exact "nothing else happened" signal. It keeps the change
  self-contained: no edits to the other actions, and a future action (e.g.
  CP-0057 duplicate) breaks the run automatically.
- **Timestamp instead of keyup or a timer.** Holding an arrow (key repeat)
  and tapping it quickly are both one run; a pause of more than a second
  starts a new undo step, so deliberate separate adjustments stay separately
  undoable. No timers to clean up; `now` is injectable for tests.
- Selecting another element ends the run via (1). Undo restores the
  pre-run position and, since it replaces `annotations`, the next nudge
  starts a fresh run.

`nudgeRun` is not part of `EditorDoc`, `Snapshot` or `readEditorDoc`;
`reset`/`hydrate` need no change because a hydrated document has a new
`annotations` array anyway.

### Keyboard (`src/hooks/useEditorShortcuts.ts`)

One small block next to Delete/Backspace, after the existing
`isTypingTarget` and `if (mod) return` guards:

- `nudgeDelta(key, e.shiftKey)` non-null, no Alt, `!e.defaultPrevented`, a
  `selectedId` exists, and `tool !== "crop"` → `preventDefault()` and
  `nudge(selectedId, dx, dy)`. The `defaultPrevented` check leaves arrow keys
  to focused widgets that already consumed them (Radix select/dropdown/tabs,
  which `preventDefault` in their React handlers before the window listener
  sees the event); range sliders are `<input>`s and already excluded.
- Otherwise fall through untouched, so the arrow keys still scroll the canvas
  viewport when nothing is selected.

Inactive while typing in inputs/textareas/contentEditable and while editing
text on the canvas (focused textarea) via the existing guard; inactive in
crop mode by the tool check; Cmd/Ctrl+Arrow and Alt+Arrow are left alone.

The canvas re-renders from props; the Transformer-attach effect in
`EditorStage` already re-runs on `annotations` change, so the selection box
follows the nudged node (including pen/highlighter, whose `points` change).

## Scope

- **In:** arrow/Shift+arrow nudge of the single selected annotation, all
  annotation types, both editor surfaces; undo coalescing; unit tests.
- **Out:** multi-select; snapping/guides during nudge; clamping to the canvas;
  a configurable step; nudging the crop box in crop mode; an in-app shortcut
  cheatsheet (none exists — candidate for a separate ticket).

## Acceptance

- With an element selected, Arrow moves it 1 image px, Shift+Arrow 10 px, at
  any zoom; arrows/lines/pen/highlighter/magnify/image move as a mouse drag
  would.
- A held or rapidly repeated nudge is undone with a single Undo; a nudge after
  a >1 s pause, after selecting something else, or after any other edit is a
  separate undo step.
- No effect while typing in an input, editing text on the canvas, or in crop
  mode; arrow keys still scroll the viewport when nothing is selected; page
  does not scroll while nudging.
- `pnpm test:unit`, `pnpm exec tsc --noEmit`, `pnpm build` green.
  Interactive check on the Mac (desktop) and `/paste` by the owner — this dev
  box is headless.
