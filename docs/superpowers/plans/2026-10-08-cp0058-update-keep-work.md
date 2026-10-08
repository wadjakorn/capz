# CP-0058 — Keep Unsaved Editor Work Across an Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flush workspaces before an update installs, and warn in the update prompt when editor work cannot survive the relaunch.

**Architecture:** All logic stays in `src/lib/updater.ts`: a warning builder and a flush helper, wired into `promptAndInstall` and the `downloadAndInstall` closure (now `download()` → flush → `install()` → `relaunch()`).

**Tech Stack:** TypeScript strict, Zustand 5, Vitest. pnpm.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-08-cp0058-update-keep-work-design.md`.
- Worktree `~/development/capz-loop-wt/cp0058`, branch `feat/cp0058-update-keep-work`.
- No Rust changes. No `localStorage`. Strings in `src/i18n/locales/{en,th}/app.ts`.

## Task 1: Warning text

- [ ] Failing tests in `src/lib/updater.test.ts` (`unsavedWorkWarning`):
  - workspaces off, empty editor → `""`.
  - workspaces off, `hasImage` → contains the "will be lost" warning.
  - workspaces off, annotations only → warning.
  - workspaces on, active doc file image → `""`.
  - workspaces on, active doc blob image → pasted-image warning.
- [ ] Add `app.updater.unsavedLost` / `app.updater.unsavedPasted` (en + th), `{warning}` slot in `app.updater.prompt`.
- [ ] Implement `unsavedWorkWarning()`; green; commit.

## Task 2: Flush before install

- [ ] Failing tests: `downloadAndInstall` calls `download`, then `commitActive` + `flushPersist` (workspaces on), then `install`, then `relaunch`, in that order; with workspaces off no flush; a flush error still installs.
- [ ] Implement `saveEditorWorkForRestart()` and the split download/install; green; commit.

## Task 3: Prompt wiring

- [ ] Failing test: `promptAndInstall` passes the warning into the `ask` message.
- [ ] Wire it; green; commit.

## Task 4: Verify + tracker

- [ ] L1 (`pnpm test:unit && pnpm exec tsc --noEmit && pnpm build`), L3 web e2e.
- [ ] `PROGRESS-FEATURE.md` entry; PR with `needs-owner-test`.
