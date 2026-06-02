# capz e2e tests

Two-tier Playwright suite.

## Tier 1 — web (default)

Runs against `next dev` with `window.__TAURI_INTERNALS__` stubbed via [fixtures/tauri-mock.ts](fixtures/tauri-mock.ts). No real Tauri runtime, no native interactions. Fast, CI-friendly.

```bash
pnpm test:e2e:web              # run all
pnpm test:e2e:ui               # interactive Playwright UI mode
pnpm exec playwright show-report e2e/playwright-report
```

## Tier 2 — tauri (smoke, manual / nightly)

Drives the packaged app via `tauri-driver` (WebDriver). Requires:

- `cargo install tauri-driver --locked`
- Linux: `apt install webkit2gtk-driver xvfb`
- macOS: experimental; WKWebView automation entitlement in a separate `tauri.test.conf.json` (TODO)

```bash
pnpm tauri build --debug
pnpm test:e2e:tauri
```

## Adding mocks

Every `invoke("cmd_name", …)` call in `src/` must have a handler in [fixtures/tauri-mock.ts](fixtures/tauri-mock.ts), otherwise tests will see `undefined`. New IPC commands → add a handler in the same PR.

## What's NOT tested here

Manual QA only — see [docs/manual-qa.md](../docs/manual-qa.md):

- Global hotkey firing
- Overlay drag-select across real monitors
- Tray icon + menu
- Real screen pixel capture
- macOS TCC permission dialog
- Native file save dialog
- Clipboard PNG write
