# CP-0059 — Undo/redo hints + Ctrl+Y — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** platform-correct undo/redo/new-workspace tooltip hints; Ctrl+Y = redo off macOS.

**Spec:** `docs/superpowers/specs/2026-10-08-cp0059-undo-redo-hints-design.md`.
Worktree `~/development/capz-loop-wt/cp0059`, branch `feat/cp0059-undo-redo-hints`.

## Task 1: Ctrl+Y redo (`src/hooks/useEditorShortcuts.ts`)

- [ ] Failing tests `src/hooks/useEditorShortcuts.undo.test.tsx`: Ctrl+Z undoes,
  Ctrl+Shift+Z redoes, Ctrl+Y redoes on win (defaultPrevented), Ctrl+Y no-op on
  mac, Ctrl+Y ignored inside a textarea, Ctrl+Shift+Y does nothing.
- [ ] Add a self-contained block next to the Z handler, gated on
  `currentPlatform() !== "mac"`. Green, commit.

## Task 2: `usePlatform()` hook + hints

- [ ] Failing test `src/hooks/usePlatform.test.tsx` (returns real platform after mount).
- [ ] `src/hooks/usePlatform.ts`; use it in `ExportSplitButton` (replace inline copy).
- [ ] Toolbar undo/redo/new-workspace hints via `formatShortcut(..., platform)`;
  WorkspaceBar new-workspace title likewise. Test: Toolbar hint render test in
  `src/components/editor/toolbar/hints.test.tsx` if Toolbar is renderable, else
  covered by L4 visual (title attributes). Commit.

## Task 3: Verify + tracker

- [ ] L1, L3, L4 (`e2e/visual/editor-undo-redo-hints.spec.ts`: Ctrl+Y redo on stage + tooltip text).
- [ ] `PROGRESS-FEATURE.md` entry; PR.
