# CP-0061 Non-Latin layout shortcuts — Implementation Plan

Spec: `docs/superpowers/specs/2026-10-08-cp0061-nonlatin-shortcuts-design.md`

**Goal:** editor shortcuts match the physical key when the layout produces
non-Latin characters (Thai), unchanged for Latin layouts.

## Task 1 — `shortcutKey` helper (TDD)
- Test: `src/lib/shortcutKey.test.ts` — Thai `ผ`/KeyZ → `z`, `ั`/KeyY → `y`,
  `จ`/Digit0 → `0`, `ข`/Minus → `-`, `ช`/Equal → `=`, `บ`/BracketLeft → `[`;
  Ctrl+Shift `(`/KeyZ → `z`; US `z`, `Z`, `Escape`, `ArrowLeft` unchanged;
  AZERTY `a`/KeyQ unchanged; Alt+`Ω`/KeyZ unchanged; unknown code unchanged.
- Implement `src/lib/shortcutKey.ts`.
- Commit `fix(editor): shortcutKey helper for non-Latin layouts (CP-0061)`.

## Task 2 — `useEditorShortcuts` (TDD)
- Test: `src/hooks/useEditorShortcuts.layout.test.tsx` — Thai Ctrl+Z undo,
  Ctrl+Shift+Z (`(`) redo, Ctrl+Y (`ั`) redo on Win, Ctrl+D (`ก`) duplicate,
  bare `พ`/KeyR → Rect tool.
- Replace `e.key.toLowerCase()` with `shortcutKey(e).toLowerCase()`.

## Task 3 — other sites
- `src/app/editor/page.tsx`, `src/app/paste/page.tsx` (Ctrl+C),
  `src/components/editor/Toolbar.tsx` (`[ ] - = + c`),
  `src/components/editor/OcrLayer.tsx` (Ctrl+A),
  `src/components/settings/SettingsView.tsx` (Ctrl+F) → `shortcutKey(e)`.
- Commit.

## Task 4 — L4 visual spec
- `e2e/visual/editor-thai-layout.spec.ts`: load, draw rect, dispatch Thai
  Ctrl+Z (`ผ`/KeyZ) → 0 rects, Ctrl+Y (`ั`/KeyY) → 1 rect, Ctrl+D (`ก`/KeyD)
  → 2 rects; `snap()` each step.

## Task 5 — verify + tracker
- L1, L3, L4; PROGRESS-BUG.md open item; PR with `needs-owner-test`.
