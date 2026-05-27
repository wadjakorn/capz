# PROGRESS-NEXT — index

Post-v0.1.7 enhancement tracker. Active work split by category for faster agent navigation. Phase 0–16 build log remains in [PROGRESS.md](PROGRESS.md).

## Trackers

- [PROGRESS-BUG.md](PROGRESS-BUG.md) — defects, permission edge cases, platform compat, regressions.
- [PROGRESS-FEATURE.md](PROGRESS-FEATURE.md) — new capabilities, tools, shortcuts, infra (release scripting, signing).
- [PROGRESS-COSMETIC.md](PROGRESS-COSMETIC.md) — UI layout, visual polish, toasts/feedback, window-merge UX, tray menu.

## Conventions

- Each tracker keeps **Open** items at the top (actionable) and **Landed** items below (context). Append, do not rewrite history.
- New entries: pick the tracker that matches the dominant impact. Mixed work (e.g. permission flow = UX + bug) goes where the *user-visible* change lives; cross-reference in the entry body.
- Mark landed entries with `(landed YYYY-MM-DD)` and include verification commands (`pnpm tsc --noEmit`, `cargo clippy --all-targets -- -D warnings`) that were run.
- Reference files via `[path](path)` Markdown links so agents can jump directly.
- Do NOT add CHANGELOG entries here — commit history + git tags are the release log.

## Carry-over from Phase 14

The two Phase 14 residual items (`Pick folder` recovery + capture-permission-revoked-mid-session won't-do) now live in [PROGRESS-BUG.md](PROGRESS-BUG.md) under Landed.
