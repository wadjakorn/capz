# CP-0080 Keep a buried editor buried — plan

Spec: [`docs/superpowers/specs/2026-10-27-cp0080-keep-buried-editor-buried-design.md`](../specs/2026-10-27-cp0080-keep-buried-editor-buried-design.md)

**Goal:** stop capture-time webview windows from activating capz on macOS.
**Architecture:** take wry 0.57.1's fix (via Tauri 2.12) and build every
capture-time window unfocused; restore first-responder for key panels by hand.

## Task 1 — Guard tests (red)
- `src-tauri/src/windows.rs` tests:
  - `lockfile_wry_skips_activation_for_unfocused_webviews` — parse
    `include_str!("../Cargo.lock")`, assert `wry` version ≥ 0.57.1.
  - `capture_windows_are_built_unfocused` — scan `include_str!("windows.rs")`
    (non-test part): every `WebviewWindowBuilder::new(` block except the
    `"editor"` one contains `.focused(false)` before its `.build()`.
- Run `cargo test --lib windows::` → both fail.

## Task 2 — Upgrade Tauri (lock test green)
- `cargo add tauri@2.12.5 --features image-png,tray-icon,macos-private-api,protocol-asset`
  (+ `tauri-build` to the matching release); `cargo update -p wry` → 0.57.1.
- `pnpm add @tauri-apps/api@~2.12` / `pnpm add -D @tauri-apps/cli@~2.12`.
- `cargo clippy --all-targets -- -D warnings` clean.

## Task 3 — Unfocused capture windows (scan test green)
- `.focused(false)` on overlay, command-ring, scroll-hud builders.

## Task 4 — First responder for key panels
- `panel::make_key` (macOS): after `make_key_window`, `with_webview` →
  `makeFirstResponder(wkwebview)`.

## Task 5 — Tracker + verification
- `PROGRESS-BUG.md` Open entry.
- L1, L2, L3, L5 (if tauri-driver); macOS build on the Mac host if reachable.
