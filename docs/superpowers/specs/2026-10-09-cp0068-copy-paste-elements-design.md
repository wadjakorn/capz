# CP-0068 — Copy/paste the selected canvas element, within and across workspaces

From [capz-inbox#13](https://github.com/wadjakorn/capz-inbox/issues/13)
(owner-accepted). Ticket CP-0068. Concrete spec for the copy/paste half of the
owner's CP-0049; duplicate (⌘D) already shipped as CP-0057.

## Goal

⌘C / Ctrl+C with an element selected copies **that element**; ⌘V / Ctrl+V
pastes it back — into the same workspace or another one — as long as the
element copy is still the most recent thing on the clipboard. With nothing
selected, ⌘C keeps copying the whole rendered image; pasting an image copied
anywhere else keeps adding it as an image layer. Desktop editor and `/paste`.

## Current state

- ⌘C: keydown handlers in `src/app/editor/page.tsx` and `src/app/paste/page.tsx`
  call `copyOnly(stage)` (`src/lib/exportImage.ts`) — whole canvas → OS
  clipboard. The right-click **Copy** (`EditorStage.ctxCopy`) and the toolbar
  copy go through the same `copyOnly`/`saveAndCopy`.
- ⌘V: a window `paste` listener. Desktop reads the OS image through the Rust
  command `read_clipboard_image_data_url` → `addOverlayImage` (or
  `paste_into_editor` on an empty canvas). Web reads the `ClipboardEvent` blob
  → `acceptBlob`. Right-click **Paste** (`EditorStage.ctxPaste`) duplicates the
  desktop logic.
- Annotations are plain JSON (`useEditor.annotations`); `cloneAnnotation`,
  `annotationAABB`, `duplicateOffset` exist from CP-0057. Workspaces:
  `useWorkspaces.activeId` (both routes).

## Design

### Behaviour

| Aspect | Decision |
|---|---|
| Copy trigger | ⌘C / Ctrl+C with an annotation selected and the tool ≠ crop. Same guards as today: not in an input/textarea/contentEditable (covers on-canvas text editing), no text selection, editor view only. Otherwise ⌘C does exactly what it did (whole image). |
| What is copied | A deep clone of the annotation (all properties) into an **in-memory element clipboard** (module state in `src/lib/elementClipboard.ts`), plus the workspace it came from. Not persisted, no settings key (Decision). |
| OS clipboard on element copy | The element alone is rendered (its Konva node, transparent background, native image px) to PNG and written to the OS clipboard. Its **fingerprint** is remembered. This both lets "most recent copy" work (below) and means pasting into another app gets a picture of the element instead of a stale clipboard. |
| Toast | "Element copied" / "คัดลอกองค์ประกอบแล้ว" (`editor.toast.elementCopied`). |
| Whole-image copy | Any capz whole-image copy (⌘C with nothing selected, toolbar, right-click, Save & copy) **clears** the element clipboard. Done inside `exportImage`'s `copyToClipboard`, so every path is covered. |
| "Most recent copy" | Owner's Decision: the OS clipboard decides. On ⌘V, if the element clipboard is set and the OS clipboard's image **matches the remembered fingerprint**, paste the element; otherwise paste the image as today. Copying an image in another app therefore wins, even after an element copy. |
| Fingerprint, not a byte hash | The OS (macOS NSPasteboard, Windows CF_DIB) and browsers re-encode PNGs, so the bytes read back never equal the bytes written. The fingerprint is: exact pixel size + an 8×8 grid of premultiplied-RGBA averages; a match is equal size and every cell within ±6/255. Unrelated images essentially never match; the re-encoded own image always does. |
| Clipboard write failed | (e.g. Firefox/Linux web) The element clipboard is kept with no fingerprint. ⌘V then pastes the element only if the OS clipboard holds **no** image; a real image still wins. |
| Paste placement — same workspace | Offset +16, +16 image px from the copied element, flipping an axis to −16 where the copy would run past the right/bottom edge (CP-0057's `duplicateOffset` rule with 16). Each paste re-anchors the clipboard on the pasted copy, so repeated ⌘V cascades (+16, +32, …) instead of stacking. |
| Paste placement — other workspace | Same coordinates, shifted the minimum needed to keep the element's box inside the canvas (top-left aligned if it is larger than the canvas). Then re-anchored there, so a second ⌘V in that workspace cascades +16. |
| Paste result | Added on top (end of the array — it is a new element, not a sibling of the source), becomes the selection, tool switches to Select so it can be moved immediately. **One undo entry** (`useEditor.add`). Geometry in image px. |
| Pins | Pasted pin takes `nextPinNumber` and persists `pins.lastUsedNumber`, as duplicate does. |
| Overlay images | `src` is a data URL; the pasted copy shares the string (same as duplicate). |
| Blur / magnify | Copied with their geometry; in another workspace they act on that workspace's image (they are lenses on the base image). |
| Empty canvas | ⌘V on a workspace without a base image behaves as today (the clipboard image becomes the base). Element paste needs a base image. |
| Crop mode | Element copy/paste is off: ⌘C/⌘V do what they did before this ticket. |
| Right-click Paste (desktop) | Goes through the same paste decision as ⌘V (shared helper), so the two never disagree. Right-click Copy stays whole-image (it is labelled as such). |
| Web `/paste` | Same rules. The clipboard write stays synchronous inside the keydown (Safari user-activation), fingerprint is computed afterwards. The pasted blob from the `ClipboardEvent` is fingerprinted. |

### Code shape

- `src/lib/elementClipboard.ts` (new):
  - pure: `fingerprintRgba`, `fingerprintsMatch`, `clampIntoBounds`,
    `pasteDelta`, `shouldPasteElement`;
  - state: `getElementClipboard`, `setElementClipboard`, `clearElementClipboard`;
  - store-level: `copySelectedElement()` (render + write + remember),
    `pasteElement()` (place, add, re-anchor);
  - browser glue: `fingerprintImage(src | Blob)`, `desktopPaste()` (shared by
    ⌘V and right-click Paste on desktop).
- `src/lib/duplicate.ts`: `duplicateOffset` takes an optional distance.
- `src/lib/stageBridge.ts`: `setAnnotationNodeLookup` / `getAnnotationNode` —
  `EditorStage` already keeps `nodeRefs`; it publishes the lookup.
- `src/lib/exportImage.ts`: `copyToClipboard` clears the element clipboard.
- `src/app/editor/page.tsx`, `src/app/paste/page.tsx`: ⌘C branches to
  `copySelectedElement` when something is selected; paste consults
  `shouldPasteElement`.
- i18n: `editor.toast.elementCopied` (en/th); glossary: element → องค์ประกอบ.

## Edge cases

- Typing in a field / editing canvas text: the existing target guards return
  before either handler does anything.
- Element whose node can't be rendered (zero-size): element clipboard is still
  set, without fingerprint (same as a failed write).
- Undo after paste removes the pasted copy; the clipboard still holds the
  element, so ⌘V works again.
- Closing the source workspace doesn't matter — the clipboard holds a clone.
- Workspaces disabled (`activeId` null on both sides): treated as the same
  workspace (+16 cascade).

## Out of scope

Multi-select copy (CP-0050) · pasting a re-editable element into other apps ·
element clipboard surviving a restart · cut (⌘X) · right-click "Copy element".

## Verification

Unit (Vitest): fingerprint, match tolerance, placement, decision table,
`copySelectedElement`/`pasteElement` against the stores, whole-image copy
clears. Web e2e + L4 visual on `/paste`: select → ⌘C → ⌘V gives a second shape
offset; a pasted foreign image still lands as an image. **Owner-test (Gate):**
the OS clipboard round-trip on real macOS and Windows — element copy → ⌘V in
another workspace; then copy an image in another app → ⌘V pastes that image.
