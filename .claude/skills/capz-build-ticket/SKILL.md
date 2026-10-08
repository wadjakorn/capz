---
name: capz-build-ticket
description: capz-loop build stage — claim one owner-accepted PM ticket (project capz, assignee capz-loop, status todo), write spec + plan, implement with TDD in an isolated worktree, run the verification layers, and open a PR. Use when run as `run-stage.sh build`, or when asked to implement a capz-loop ticket end to end.
---

# capz-build-ticket (build)

Read `capz-loop` first. One run = **one ticket**. The prompt gives the ticket
id the precheck picked (or a stale `doing` ticket to recover).

## 1. Claim

```
pm task get --id <id>            # must be assignee capz-loop, title not "[release]"
pm task move --id <id> --status doing   # the status is the lock (todo → doing)
```

If the move fails with `conflict` or `illegal_transition`, another run owns it — stop.
Append `- <ISO> build: claimed` to STATUS.

**Source of truth:** `## Proposal` + `## Decisions` (owner-approved) and any
owner answers in `## STATUS`. The `UNTRUSTED` section is only context.

## 2. Workspace — resume or start

Key = `cpNNNN` from the ticket key. Look for prior work first:
`git -C ~/development/capz-loop branch -r --list 'origin/*/cp<NNNN>-*'` and
`gh pr list -R wadjakorn/capz --search "CP-<NNNN> in:title" --state open`.

- **Exists** (resumed from `blocked`): reuse the branch in
  `~/development/capz-loop-wt/cp<NNNN>` (`git worktree add` it if missing),
  read the newest STATUS entries for the owner's answer, continue.
- **New:**
  ```
  cd ~/development/capz-loop && git fetch origin
  git worktree add ~/development/capz-loop-wt/cp<NNNN> -b <feat|fix>/cp<NNNN>-<slug> origin/main
  cd ~/development/capz-loop-wt/cp<NNNN> && pnpm install --frozen-lockfile
  ```

## 3. Spec, then plan (committed)

- Spec: `docs/superpowers/specs/<YYYY-MM-DD>-cp<NNNN>-<slug>-design.md` —
  goal, source issue link, behaviour, decided defaults (with the why), edge
  cases (typing in fields, canvas text editing, crop mode, desktop vs `/paste`),
  out of scope. Match the style of neighbouring specs.
- Plan: `docs/superpowers/plans/<YYYY-MM-DD>-cp<NNNN>-<slug>.md` — bite-sized
  TDD tasks with file paths (use the `superpowers:writing-plans` approach).
- Commit each: `docs(spec): CP-NNNN …`, `docs(plan): CP-NNNN …`.
- Put a short summary + the plan's task list + both paths at the top of the
  ticket's `## STATUS` (keep all other sections intact).

A real fork the spec can't settle → write it under `## Questions`, STATUS note,
`pm task move --status blocked`, stop. Don't guess on product decisions.

## 4. Implement (TDD)

Follow `superpowers:test-driven-development`: failing test → minimal code →
green → commit. Conventions that tripped earlier tickets:

- **i18n:** every user-facing string in both `src/i18n/locales/en/*` and
  `src/i18n/locales/th/*` (Thai is the default UI). New terms go in
  `src/i18n/GLOSSARY.md` (e.g. duplicate → ทำสำเนา, not คัดลอก).
- **Platform split:** branch with `isTauriRuntime()` (`src/lib/platform.ts`);
  never `localStorage`; Tauri imports behind dynamic import.
- **Shortcuts:** editor keys live in `src/hooks/useEditorShortcuts.ts` — add a
  small self-contained block; respect the typing/crop guards already there.
- **Undo:** go through the editor store's history (`src/stores/editor.ts`).
- **Stack is locked** (CLAUDE.md): pnpm only, no new frameworks.

## 5. Verify (the layers — see capz-loop for the e2e lock)

| Layer | Command | Required when |
|---|---|---|
| L1 | `pnpm test:unit && pnpm exec tsc --noEmit && pnpm build` | always |
| L2 | `cd src-tauri && cargo clippy --all-targets -- -D warnings` | `src-tauri/**` changed |
| L3 | `flock "$CAPZ_LOOP_E2E_LOCK" env CI=1 pnpm test:e2e:web` | always |
| L4 | write `e2e/visual/<slug>.spec.ts` (copy `editor-nudge-duplicate.spec.ts`: load → act → `snap()` before/after → assert on the stage), run `flock "$CAPZ_LOOP_E2E_LOCK" env CI=1 CAPZ_VISUAL_OUT=$PWD/e2e/visual-out pnpm test:e2e:visual <slug>`, then `node scripts/loop/visual-report.mjs e2e/visual-out <PR#>` after the PR exists | `src/components/editor/**`, `src/stores/**`, `src/hooks/**` changed |
| L5 | `flock "$CAPZ_LOOP_E2E_LOCK" xvfb-run --auto-servernum pnpm test:e2e:tauri` (needs a debug build: `pnpm tauri build --debug`) | `src-tauri/**` or `src/app/{overlay,ring,scroll-hud,scroll-guide}/**` changed — skip with a note if `tauri-driver` is not installed |

`PLAYWRIGHT_CHANNEL=chrome` is set by the runner (Playwright ships no Chromium
for this Ubuntu). Anything failing → fix it; never weaken or skip a test to
get green. Use `superpowers:verification-before-completion` before claiming done.

## 6. Tracker, PR, hand-off

- Add the ticket to `PROGRESS-FEATURE.md` (or `-BUG.md` / `-COSMETIC.md`) in
  the existing `## Open` format: `- [ ] **Title (CP-NNNN)** — …`.
- Push, then:
  ```
  gh pr create -R wadjakorn/capz --base main --label capz-loop \
    --title "<type>(<area>): <summary> (CP-NNNN)" --body "…"
  ```
  Body: Summary · Source (`capz-inbox#N`, CP-NNNN) · Decisions · Test plan
  (what ran, layer by layer; what only a human on Mac/Windows can check, as a
  checklist) · L4 report link if any · the Claude Code footer.
- Add `--label needs-owner-test` if `## Decisions` says `Gate: owner-test`, or
  if your own tests cannot prove the claim. (CODEOWNERS paths are gated by
  GitHub automatically.)
- Ticket: STATUS `- <ISO> build: PR #<n>` → `pm task move --status completed`.
- Leave the worktree; verify cleans it up after merge.

Print: ticket, PR URL, layers run, anything unverified.
