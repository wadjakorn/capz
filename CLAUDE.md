# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository State

Shipped. Desktop app (**capz**, macOS + Windows) built and released. Also ships a browser-only paste editor at `/paste` (Cloudflare Pages). PLAN.md is the original phased build spec; PROGRESS-NEXT.md + sub-trackers ([PROGRESS-BUG.md](PROGRESS-BUG.md), [PROGRESS-FEATURE.md](PROGRESS-FEATURE.md), [PROGRESS-COSMETIC.md](PROGRESS-COSMETIC.md)) are the live work log.

## Stack (locked, do not substitute)

- **Shell:** Tauri v2.x + Rust (stable, 1.75+)
- **Frontend:** Next.js 15 **static export only** (`output: 'export'`), TypeScript 5 strict, Tailwind 4, shadcn/ui, Zustand 5
- **Canvas editor:** react-konva + konva
- **Rust capture/encode:** `xcap` + `image` crates
- **Package manager:** pnpm 9 (never npm/yarn)
- **IPC types:** hand-written TypeScript mirroring the Rust structs — there is no codegen

## Commands

```bash
pnpm tauri dev                              # desktop dev loop (Tauri + Rust hot-reload)
pnpm dev                                    # web-only dev server (Next.js, no Tauri)
pnpm tauri build                            # produces .app (macOS) / .msi (Windows)
pnpm build                                  # web static export → out/ (Cloudflare Pages)
pnpm test:unit                              # Vitest unit tests
pnpm tauri add <plugin>                     # add Tauri plugin (auto-wires Rust + JS)
cargo add <crate>                           # add Rust deps (never edit Cargo.toml by hand except target cfg)
cargo clippy --all-targets -- -D warnings   # must be clean
pnpm tauri signer generate -w ~/.tauri/capz-updater.key    # one-time updater keypair
```

## Architecture Big Picture

One long-lived editor window plus transient helper windows, all driven by the Rust core. (PLAN.md §2 describes the *original plan*; the shipped shape below is authoritative where they disagree.)

- **Tray** (always present) → dispatches capture. Global shortcuts are registered at startup in `lib.rs` via `shortcuts::register_shortcuts`, not by the tray.
- **Editor window** (`editor`) — **single and reused**, not one per capture. Hosts the Konva annotation stage, and also hosts the **Settings** and **Onboarding** *views* (`src/app/editor/page.tsx`) — neither has its own window.
- **Overlay windows** (`overlay-<monitor_id>`) — **one transparent window per monitor**, not a single union-spanning window: macOS "Displays have separate Spaces" blocks a window that spans screens. Area selection stays per-display; the drag emits `{x,y,w,h,monitor_id}` to Rust.
- **Transient helpers:** command ring (`command-ring`), scroll HUD (`scroll-hud`), scroll guide (`scroll-guide`).

Capture pipeline: hotkey → Rust enumerates monitors via `xcap` → captures buffer → `image_service` encodes PNG (or JPEG, per the user's intermediate-format setting) → writes to the OS temp dir as **`capz-temp-<unix_millis>.{png,jpg}`** → `windows::load_editor_image` shows the editor and emits `editor:load-image` carrying the path; the webview loads it via `convertFileSrc` (it is **not** a URL param). Loading a new image deletes the prior temp file; on startup `image_service::sweep_stale_temp` removes `capz-temp-*` files older than 24h.

Output is either file (via `tauri-plugin-fs` + `tauri-plugin-dialog`) or clipboard PNG (via `tauri-plugin-clipboard-manager.writeImage`). No backend API, no telemetry, no cloud in v1.

## Cross-Cutting Rules (PLAN.md §5 — read before Phase 4+)

- **High-DPI:** `xcap` returns **physical pixels**. Overlay coords are **logical (CSS) pixels** — multiply by `devicePixelRatio` (frontend) or `monitor.scale_factor()` (Rust) before passing to xcap. Konva export uses `pixelRatio: 1 / scale` (`src/lib/exportImage.ts`) so the export is native-resolution regardless of on-screen zoom — it is not a hardcoded `2`.
- **Multi-monitor:** one overlay window **per monitor** (`overlay-<monitor_id>`) — negative coords are normal. Area selection is restricted to a single monitor; no cross-monitor stitching.
- **Storage:** **No `localStorage`/`sessionStorage`.** Use `tauri-plugin-store` exclusively on desktop. The web build cannot use the store — `src/stores/settings.ts` falls back to in-memory `DEFAULT_CONFIG` when `!isTauriRuntime()`; do not add localStorage as a web fallback.
- **Platform split:** use `isTauriRuntime()` (`src/lib/platform.ts`) to branch between desktop and web at runtime. Gate all Tauri IPC and plugins behind this check and use `next/dynamic` to code-split Tauri imports out of the web bundle. Do not gate on build-time env vars or eslint rules.
- **Window labels** must be unique. In use: `editor`, `overlay-<monitor_id>`, `command-ring`, `scroll-hud`, `scroll-guide`. Don't reuse `main`.
- **Capabilities:** per-window JSON files in `src-tauri/capabilities/` — `default.json`, `desktop.json`, `editor.json` (windows: `editor`) and `overlay.json` (windows: `overlay-*`, `scroll-hud`, `scroll-guide`, `command-ring`). Give each window the **minimum** scope.
- **Filesystem writes** for user-facing output go through `tauri-plugin-fs` with explicit scope in capabilities, never raw Rust `std::fs`. (Internal temp files under `$TEMP` are written directly by `image_service` — that is intentional and not user-facing output.)
- **IPC:** shared types are hand-written on both sides and must be kept in sync manually. There is **no** `ts-rs` dependency and **no** `src/types/` directory.

## Updater Key (CRITICAL — PLAN.md §5.8)

Ed25519 update-signing keypair is a **single point of failure for the entire user base** and **cannot be rotated**. If lost, all installed copies are permanently un-updatable. If leaked, attacker signs malicious updates that verify on every install.

- Store in encrypted secrets manager (1Password/Bitwarden/Vault) with ≥2 team members access + offline encrypted backup
- CI uses GitHub Actions encrypted secrets only — never written to workflow logs or repo
- Local key path: `~/.tauri/capz-updater.key` — never inside the repo
- Distinct from Apple Developer ID, Windows code signing cert, and GitHub tokens — do not conflate

## Phase Execution Protocol (PLAN.md §4, Phases 0–12)

- Execute phases **in order**. Each phase has acceptance checks — do not advance until they pass with `pnpm tauri dev` verified interactively.
- Maintain the live trackers as work completes: PROGRESS-NEXT.md + the sub-trackers listed under Repository State. There is no `PROGRESS.md`.
- Commit per phase with conventional commits: `feat(phase-N): <description>`.
- When a Tauri API is unclear, consult v2 docs in PLAN.md §8 — APIs differ significantly from Tauri v1; do not guess from v1 memory.
- Open questions in PLAN.md §9 must be resolved with the user **before Phase 7** (output behavior, branding, filename template, sticker library, update channel, telemetry).

## Default Hotkeys

Defined in `src-tauri/src/shortcuts.rs`:

- Full screen: `CmdOrCtrl+Alt+Shift+3`
- Area: `CmdOrCtrl+Alt+Shift+4`
- Window: `CmdOrCtrl+Alt+Shift+5`
- Show editor: `CmdOrCtrl+Alt+Shift+0`
- Command ring: `CmdOrCtrl+Shift+Space`
- Scrolling capture: **unbound by default** (empty accelerator = not registered; the user assigns one in Settings)

macOS reserved (cannot override): `Cmd+Space`, `Cmd+Tab`, `Cmd+Q`, `Cmd+Shift+3/4/5`. `register()` may silently lose to last-registered app on some OSes — document in onboarding, expose "Reset to defaults" in Settings.
