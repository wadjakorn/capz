# CP-0065 WYSIWYG text editor — implementation plan

Spec: `docs/superpowers/specs/2026-10-09-cp0065-wysiwyg-text-editor-design.md`.
TDD: each task = failing test → minimal code → green → commit.

## Tasks

1. **Shared layout** — `src/lib/textLayout.ts` + `.test.ts`: move
   `measureTextInk` out of `EditorStage.tsx`; add `textBoxLayout(a)`
   (padX/padY/innerW/innerH/w/h/cornerRadius/bg/font props) and test it with a
   stubbed width (no bg → zero padding/radius; bg → padY = round(padX·0.66),
   radius clamp 6–22). `TextShape` uses it.
2. **Overlay mapping** — `textEditorOverlay(layout, scale)` in the same
   module: box/radius/text offset/font size scaled; caret slack shift per
   align. Tests at scale 1 and 0.5.
3. **Draft helper** — `draftTextAnnotation(te, toolsCfg, existing?)` used by
   `commitTextEditor` and the overlay (fixes the background fallback).
4. **Overlay rewrite** — `EditorStage.tsx`: drop `screenX/screenY` from
   `TextEditor`; render box div + textarea inside the stage wrapper at the
   annotation's scaled position with rotation; outline affordance;
   `data-testid="text-editor-box"`.
5. **Hide node while editing** — `TextShape` `visible={!editing}` via
   `ctx.editingText`; Transformer detached while editing.
6. **e2e** — `e2e/web/text-editor-wysiwyg.spec.ts`: overlay rect vs committed
   node client rect within 2 px at zoom 1 and after Ctrl+wheel zoom; re-edit
   hides the node. Existing `editor-mouse` text test still green.
7. **L4 visual** — `e2e/visual/editor-text-wysiwyg.spec.ts` snaps editing vs
   committed.
8. **Tracker + PR** — `PROGRESS-BUG.md` entry, PR.
