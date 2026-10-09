# CP-0067 Copy closes editor — implementation plan

Spec: `docs/superpowers/specs/2026-10-09-cp0067-copy-closes-editor-design.md`.
TDD: each task = failing test → minimal code → green → commit.

## Tasks

1. **Schema v5** — `src/lib/config.ts`: `general.copyClosesEditor` (type,
   default `false`, validator `isBool`), `CONFIG_SCHEMA_VERSION = 5`, identity
   step `4`. Tests: `config.migrate.test.ts` (v4 store migrates to v5 with the
   key defaulting false, user values kept); regenerate `shape.v5.json`; add
   `__fixtures__/config/v5.json`; point `settings.desktop.test.ts` at v5.
2. **Pre-close `alreadyCopied`** — `src/lib/preClose.ts(+test)`:
   `runPreCloseAction({ alreadyCopied })` skips `copy`, runs `saveOnly` for
   `both`, unchanged for `file`/`none`.
3. **`closeEditor()`** — `src/lib/closeEditor.ts(+test)`: commit + flush the
   workspace, pre-close action, hide window (mocked). `onCloseRequested` in
   `src/app/editor/page.tsx` calls it.
4. **⌘C wiring** — `src/app/editor/page.tsx`: after a successful whole-image
   copy, if `config.general.copyClosesEditor && isTauriRuntime()` →
   `closeEditor({ alreadyCopied: true })`. Element copy returns before this.
5. **Settings row** — registry `after.copyCloses` (addedIn 0.18.0, keywords),
   `AfterCapturePage.tsx` toggle below On close, en/th strings.
6. **e2e** — `e2e/web/settings.spec.ts`: the toggle exists on Saving and
   flips. L4 `e2e/visual/editor-copy-closes.spec.ts`: setting on in web →
   Ctrl+C still copies and editor stays (web has no window), snapshot.
7. **Tracker + PR** — `PROGRESS-FEATURE.md`, PR with `needs-owner-test`.
