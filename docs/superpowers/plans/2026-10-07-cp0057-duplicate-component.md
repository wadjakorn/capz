# CP-0057 — Duplicate Selected Component — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ⌘D / Ctrl+D and a Duplicate button clone the selected annotation (+10 px, directly above, selected, one undo entry) in `/editor` and `/paste`.

**Architecture:** A pure clone helper + `duplicate` action in the editor store; a thin `src/lib/duplicate.ts` entry point (guards, offset flip, pin persistence) shared by the keyboard shortcut and the tool-options panel button.

**Tech Stack:** Next.js 15 static export, TypeScript strict, Zustand 5, Vitest. pnpm 9.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-07-cp0057-duplicate-component-design.md`.
- Worktree: `/home/wadjakorn/development/capz-duplicate`, branch `feat/duplicate-component`, off `origin/main` (v0.15.0).
- Headless Linux — no Tauri GUI here; the owner tests on the Mac.
- `src/hooks/useEditorShortcuts.ts` is also being edited by CP-0056 (arrow nudge) — keep the change to one self-contained block plus one import.
- Gates: `pnpm test:unit`, `pnpm exec tsc --noEmit`, `pnpm build` (no lint script exists). No Rust changes.
- No `localStorage`. All new UI strings in both `src/i18n/locales/en` and `th`.

## File Structure

- `src/stores/editor.ts` — `cloneAnnotation` export + `duplicate` action. *(Task 1)*
- `src/stores/editor.duplicate.test.ts` — **new**. *(Task 1)*
- `src/lib/duplicate.ts` + `src/lib/duplicate.test.ts` — **new**: offset rule, guards, entry point. *(Task 2)*
- `src/hooks/useEditorShortcuts.ts` — ⌘/Ctrl+D block. *(Task 3)*
- `src/components/editor/toolbar/panels/ToolOptionsPanel.tsx`, `src/components/editor/Toolbar.tsx`, `src/i18n/locales/{en,th}/editor.ts`, `src/i18n/GLOSSARY.md` — button + strings. *(Task 4)*
- `PROGRESS-FEATURE.md` / `PROGRESS-NEXT.md` — tracker. *(Task 5)*

---

## Task 1: Store — `cloneAnnotation` + `duplicate`

**Interfaces produced:**
- `cloneAnnotation(a: Annotation, id: string, dx: number, dy: number): Annotation`
- `duplicate(id: string, delta?: { dx: number; dy: number }): string | null` on `useEditor`

- [ ] **Step 1: failing tests** in `src/stores/editor.duplicate.test.ts`:
  - clone gets the new id, is shifted, and shares no arrays/objects (pen `points`, image `crop`) with the source; arrow `cx/cy` shift too.
  - `duplicate` inserts at index+1 (middle of the list), selects the copy, returns its id, default offset +10/+10, custom delta honoured.
  - one undo entry: `past.length` +1, `future` cleared; undo restores the list and `nextPinNumber`; redo restores the copy.
  - pin copy takes `nextPinNumber` and advances it.
  - image copy keeps the same `src` string.
  - unknown id → `null`, state unchanged.
- [ ] **Step 2:** `pnpm test:unit src/stores/editor.duplicate.test.ts` → FAIL (not exported).
- [ ] **Step 3:** implement: `cloneAnnotation = shiftAnnotation(structuredClone(a) with id, dx, dy)`; action splices at `from + 1`, pin `number = nextPinNumber`, `nextPinNumber + 1`, `pushHistory`, `future: []`, `selectedId: copy.id`.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5:** commit `feat(editor): duplicate action in the editor store (CP-0057)`.

## Task 2: `src/lib/duplicate.ts`

**Interfaces produced:**
- `DUPLICATE_OFFSET = 10`, `DUPLICATE_SHORTCUT = "CmdOrCtrl+D"`
- `duplicateOffset(aabb: AABB | null, bounds: {w,h} | null): {dx, dy}`
- `canDuplicate(s: { tool: Tool; selectedId: string | null }): boolean`
- `duplicateSelected(): string | null`

- [ ] **Step 1: failing tests** `src/lib/duplicate.test.ts`:
  - `duplicateOffset`: +10/+10 in the middle; −10 on an axis that would overflow right/bottom; stays +10 when flipping would go negative or bounds/aabb unknown.
  - `canDuplicate`: false with no selection or in crop mode.
  - `duplicateSelected`: no-op in crop mode / no selection; duplicates with a flipped offset near the edge (stage size set via `setStageImageSize`); pin copy writes `pins.lastUsedNumber` via `useSettings.update` (spy).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(editor): duplicateSelected entry point with edge-aware offset (CP-0057)`.

## Task 3: Keyboard shortcut

- [ ] **Step 1:** in `useEditorShortcuts.ts`, after the ⌘Z block and before the zoom combos, add:
  ```ts
  // CP-0057: duplicate the selection. Always swallow it so browsers don't
  // open "bookmark this page" on Ctrl+D; duplicateSelected() no-ops in crop
  // mode / with nothing selected.
  if (mod && key === "d" && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    duplicateSelected();
    return;
  }
  ```
  The existing `isTypingTarget` early return already covers inputs and on-canvas text editing.
- [ ] **Step 2:** `pnpm exec tsc --noEmit` clean.
- [ ] **Step 3:** commit `feat(editor): Cmd/Ctrl+D duplicates the selection (CP-0057)`.

## Task 4: Duplicate button + strings

- [ ] **Step 1:** i18n: add `"editor.duplicate": "Duplicate ({shortcut})"` (en) and `"ทำสำเนา ({shortcut})"` (th); GLOSSARY row `duplicate | ทำสำเนา`.
- [ ] **Step 2:** `ToolOptionsPanel`: new prop `duplicate: { onDuplicate: () => void; disabled: boolean } | null`; render a `CopyPlus` icon button (reuse `ReorderButton`) after the reorder group, divided by a `h-5 w-px` rule; title `t("editor.duplicate", { shortcut: formatShortcut(DUPLICATE_SHORTCUT) })`.
- [ ] **Step 3:** `Toolbar`: pass `duplicate={selected ? { onDuplicate: () => duplicateSelected(), disabled: !canDuplicate(...) } : null}`.
- [ ] **Step 4:** `pnpm exec tsc --noEmit` + `pnpm test:unit` (i18n key-parity tests) green.
- [ ] **Step 5:** commit `feat(editor): Duplicate button in the selection footer (CP-0057)`.

## Task 5: Tracker, full gates, PR

- [ ] **Step 1:** add CP-0057 to `PROGRESS-FEATURE.md` (+ `PROGRESS-NEXT.md` if it lists in-flight items) in the existing format.
- [ ] **Step 2:** `pnpm test:unit && pnpm exec tsc --noEmit && pnpm build`.
- [ ] **Step 3:** commit `docs(progress): track CP-0057 duplicate component`; push; `gh pr create` against `main` (test plan notes Mac GUI verification by the owner).
