# CP-0068 Copy/paste elements — implementation plan

Spec: `docs/superpowers/specs/2026-10-09-cp0068-copy-paste-elements-design.md`.
TDD: each task = failing test → minimal code → green → commit.

## Tasks

1. **`duplicateOffset` distance param** — `src/lib/duplicate.ts(+test)`:
   optional third arg `d = DUPLICATE_OFFSET`; test that `d=16` flips at the
   edge with ±16.
2. **Pure helpers** — `src/lib/elementClipboard.ts` + `.test.ts`:
   `fingerprintRgba(data,w,h)` (8×8 premultiplied grid), `fingerprintsMatch`
   (size equal, cells ±6), `clampIntoBounds(aabb,bounds)`,
   `pasteDelta(sameWorkspace,aabb,bounds)`, `shouldPasteElement(entry, tool,
   hasImage, clip)` decision table.
3. **Clipboard state + `pasteElement()`** — module state get/set/clear;
   `pasteElement` clones with the delta, pin numbering + `pins.lastUsedNumber`,
   `setTool("select")`, `add` (one undo), re-anchors on the copy + current
   workspace. Tests against `useEditor`/`useWorkspaces`/stageBridge size.
4. **Node lookup bridge** — `src/lib/stageBridge.ts`
   `setAnnotationNodeLookup/getAnnotationNode`; `EditorStage` publishes
   `nodeRefs` lookup on mount, clears on unmount.
5. **`copySelectedElement()`** — guards (`canDuplicate`), clone into the
   clipboard, render node → PNG → OS clipboard (Tauri `writeImage` / web
   `copyPngWithFallback(…, null)` called synchronously), fingerprint via
   `fingerprintImage`. Unit-test the state outcome with the node lookup absent
   (fingerprint null) and with a stub node + injected writer.
6. **Whole-image copy clears** — `src/lib/exportImage.ts` `copyToClipboard`
   calls `clearElementClipboard()`; test in `exportImage.test.ts`.
7. **`desktopPaste()`** — shared by editor ⌘V and `EditorStage.ctxPaste`:
   empty canvas → `paste_into_editor`; else read clipboard image, element if
   `shouldPasteElement`, otherwise `addOverlayImage`. Returns an outcome the
   callers map to toasts.
8. **Wire ⌘C / ⌘V** — `src/app/editor/page.tsx` and `src/app/paste/page.tsx`;
   toast `editor.toast.elementCopied` (en/th), glossary entry.
9. **e2e** — `e2e/web/paste.spec.ts`: select rect → Ctrl+C → paste event with
   no image → 2 rects, second offset +16; paste event with an image → image
   layer added. L4 `e2e/visual/editor-copy-paste-element.spec.ts`.
10. **Tracker + PR** — `PROGRESS-FEATURE.md`, PR with `needs-owner-test`.
