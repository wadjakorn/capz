# capz e2e tests

Two-tier Playwright suite.

## Tier 1 — web (default)

Runs against `next dev` with `window.__TAURI_INTERNALS__` stubbed via [fixtures/tauri-mock.ts](fixtures/tauri-mock.ts). No real Tauri runtime, no native interactions. Fast, CI-friendly.

```bash
pnpm test:e2e:web              # run all
pnpm test:e2e:ui               # interactive Playwright UI mode
pnpm exec playwright show-report e2e/playwright-report
```

## Mobile project

`--project=mobile` runs `e2e/mobile/*.spec.ts` against `devices["Pixel 5"]`,
which sets `hasTouch`.

Playwright's `page.touchscreen` only exposes `tap(x, y)`, so multi-finger
gestures go through CDP `Input.dispatchTouchEvent` instead. The helpers live in
`e2e/mobile/gestures.ts` (`pinch`, `twoFingerDrag`) - use those rather than
hand-rolling CDP calls. This binds the suite to Chromium, which is already true
of the `web` project.

Playwright ships no browser build for some newer Linux distros, including
Ubuntu 26.04. `PLAYWRIGHT_CHANNEL=chrome` makes the suite run against a
system-installed Chrome instead. That switch is env-gated in
`e2e/playwright.config.ts`, and CI leaves it unset, so CI keeps using the
downloaded browser.

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
