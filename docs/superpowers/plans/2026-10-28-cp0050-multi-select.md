# CP-0050 Multi-select — implementation plan

Spec: `docs/superpowers/specs/2026-10-28-cp0050-multi-select-design.md`

TDD: each task writes the failing test first, then the minimal code, then commits.

## Task 1 — Store: `selectedIds` + multi actions
- Test `src/stores/editor.multiselect.test.ts`: `select`, `toggleSelect`,
  `selectMany` keep `selectedId` mirror right (1 → id, 0/2+ → null);
  `removeMany`, `moveMany`, `updateMany` = one undo step and undo restores all;
  `nudgeMany` coalesces a run keyed on the id set and breaks on a different set;
  `setTool`/`undo`/`hydrate`/`applyCrop` clear `selectedIds`.
- Code `src/stores/editor.ts`: `selectedIds` state, `selection(ids)` helper
  writing both fields, new actions, every existing `selectedId:` write routed
  through the helper; `nudgeRun.id` → `ids` key.
- Update existing tests that seed `selectedId` via `setState` to seed
  `selectedIds` too.

## Task 2 — Marquee hit-test helper
- Test `src/lib/annotationBounds.test.ts` (extend): `annotationsInRect` keeps
  fully contained, skips partly covered, normalises negative w/h.
- Code `src/lib/annotationBounds.ts`.

## Task 3 — Shortcuts
- Test `src/hooks/useEditorShortcuts.multiselect.test.tsx`: Delete removes all
  selected in one undo; arrows call `nudgeMany` on the set; Esc clears 2+.
- Code `src/hooks/useEditorShortcuts.ts`.

## Task 4 — Stage: click modifiers, marquee, outlines, group drag
- `src/components/editor/EditorStage.tsx`: capture-phase pointerdown records the
  platform modifier; `onSelect` toggles / keeps group / selects; collapse on
  click-without-drag; marquee state + window move/up listeners; marquee Rect
  and member outlines in the `screen-chrome` layer; Transformer detached at 2+;
  arrows get `selected` only when single; Stage `onDragStart/Move/End` drive
  group drag (render offset for other members, group-aware `snapDrag`,
  suppressed per-shape `onChange`, one `moveMany`).
- Autosave guard (`useWorkspaceSession.ts`) checks `selectedIds.length`.

## Task 5 — Style panel
- `src/components/editor/Toolbar.tsx`: same-type → primary drives controls,
  `updateAnnotation` → `updateMany`; mixed → `kind: "multi"`; no reorder /
  duplicate at 2+.
- `ToolOptionsPanel.tsx`: `multi` prop renders count + mixed hint.
- i18n `editor.multi.*` in `en` + `th`; GLOSSARY entry.

## Task 6 — E2E + visual
- `e2e/web/editor-multiselect.spec.ts` on `/paste`: three rects, marquee two
  (half-covered skipped), drag group, undo, Ctrl/Meta toggle, same-type
  restyle, mixed hint, Delete.
- `e2e/visual/editor-multiselect.spec.ts`: before/after snaps.

## Task 7 — Verify + tracker + PR
- L1, L3, L4; `PROGRESS-FEATURE.md` entry; PR with `needs-owner-test`.
