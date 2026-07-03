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
- **IPC types:** `ts-rs` to mirror Rust structs → `src/types/ipc.ts`

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

Three Tauri windows + tray, all driven by Rust core (PLAN.md §2):

- **Tray** (always present) → registers global shortcuts → dispatches capture
- **Overlay window** (`overlay`): transparent, fullscreen across **union of all monitors**, area-select drag → emits `{x,y,w,h,monitor_id}` to Rust
- **Editor window** (`editor-<timestamp>`, multiple may coexist): loads temp PNG into Konva stage for annotation
- **Settings window** (`settings`): hidden by default
- **Onboarding window** (`onboarding`): first-launch only, drives macOS TCC permission flow

Capture pipeline: hotkey → Rust enumerates monitors via `xcap` → captures buffer → encodes PNG via `image` → writes to OS temp dir as `shotr-temp-*.png` → spawns editor window with file path as URL param. On editor close, **delete the temp file**; on startup, sweep stale `shotr-temp-*.png` >24h old.

Output is either file (via `tauri-plugin-fs` + `tauri-plugin-dialog`) or clipboard PNG (via `tauri-plugin-clipboard-manager.writeImage`). No backend API, no telemetry, no cloud in v1.

## Cross-Cutting Rules (PLAN.md §5 — read before Phase 4+)

- **High-DPI:** `xcap` returns **physical pixels**. Overlay coords are **logical (CSS) pixels** — multiply by `devicePixelRatio` (frontend) or `monitor.scale_factor()` (Rust) before passing to xcap. Konva export uses `pixelRatio: 2` on Retina.
- **Multi-monitor:** overlay must cover union of all monitor rects (negative coords are normal). v1 restricts area selection to a single monitor — no cross-monitor stitching.
- **Storage:** **No `localStorage`/`sessionStorage`.** Use `tauri-plugin-store` exclusively on desktop. The web build cannot use the store — `src/stores/settings.ts` falls back to in-memory `DEFAULT_CONFIG` when `!isTauriRuntime()`; do not add localStorage as a web fallback.
- **Platform split:** use `isTauriRuntime()` (`src/lib/platform.ts`) to branch between desktop and web at runtime. Gate all Tauri IPC and plugins behind this check and use `next/dynamic` to code-split Tauri imports out of the web bundle. Do not gate on build-time env vars or eslint rules.
- **Window labels** must be unique: `settings`, `overlay`, `editor-<timestamp>`, `onboarding`. Don't reuse `main`.
- **Capabilities:** per-window JSON files in `src-tauri/capabilities/` (`default.json`, `overlay.json`, `editor.json`) — give each window the **minimum** scope.
- **Filesystem writes** go through `tauri-plugin-fs` with explicit scope in capabilities, never raw Rust `std::fs` for user-facing output.
- **IPC:** shared types live in `src/types/ipc.ts`, generated from Rust via `ts-rs`.

## Updater Key (CRITICAL — PLAN.md §5.8)

Ed25519 update-signing keypair is a **single point of failure for the entire user base** and **cannot be rotated**. If lost, all installed copies are permanently un-updatable. If leaked, attacker signs malicious updates that verify on every install.

- Store in encrypted secrets manager (1Password/Bitwarden/Vault) with ≥2 team members access + offline encrypted backup
- CI uses GitHub Actions encrypted secrets only — never written to workflow logs or repo
- Local key path: `~/.tauri/capz-updater.key` — never inside the repo
- Distinct from Apple Developer ID, Windows code signing cert, and GitHub tokens — do not conflate

## Phase Execution Protocol (PLAN.md §4, Phases 0–12)

- Execute phases **in order**. Each phase has acceptance checks — do not advance until they pass with `pnpm tauri dev` verified interactively.
- Maintain `PROGRESS.md` checklist as phases complete.
- Commit per phase with conventional commits: `feat(phase-N): <description>`.
- When a Tauri API is unclear, consult v2 docs in PLAN.md §8 — APIs differ significantly from Tauri v1; do not guess from v1 memory.
- Open questions in PLAN.md §9 must be resolved with the user **before Phase 7** (output behavior, branding, filename template, sticker library, update channel, telemetry).

## Default Hotkeys

- Full screen: `CmdOrCtrl+Alt+Shift+3`
- Area: `CmdOrCtrl+Alt+Shift+4`

macOS reserved (cannot override): `Cmd+Space`, `Cmd+Tab`, `Cmd+Q`, `Cmd+Shift+3/4/5`. `register()` may silently lose to last-registered app on some OSes — document in onboarding, expose "Reset to defaults" in Settings.
