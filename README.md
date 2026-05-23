# capz

Cross-platform (macOS + Windows) screenshot capture & annotation desktop app. Runs in tray, captures full-screen or user-selected area via global hotkeys, opens an in-app editor (text, arrows, shapes, blur, stickers, numbered pins), outputs to file or clipboard.

## Stack

Tauri v2 · Rust · Next.js 15 (static export) · TypeScript · Tailwind 4 · shadcn/ui · Zustand · react-konva · `xcap` · `image`

## Status

Shipping. macOS (arm64 + x64) + Windows (x64) builds released via GitHub. See [PROGRESS.md](PROGRESS.md) for phase log.

## Install (macOS, Homebrew)

```bash
brew tap wadjakorn/capz
brew install --cask capz
```

## Develop

```bash
pnpm install
pnpm tauri dev
```

## Build

```bash
pnpm tauri build      # .app (macOS) / .msi (Windows)
```

## Requirements

- Node 20+, pnpm 9+
- Rust stable 1.75+
- macOS 12+ or Windows 10/11

## Default Hotkeys

- Full screen: `CmdOrCtrl+Alt+Shift+3`
- Area: `CmdOrCtrl+Alt+Shift+4`
- Window: `CmdOrCtrl+Alt+Shift+5`
- Show editor: `CmdOrCtrl+Alt+Shift+0`

## Auto-update

Background updater polls `https://wadjakorn.github.io/capz/latest.json` (signed via Ed25519 minisign). Manual: Settings → Updates → Check now.

## Docs

- [PLAN.md](PLAN.md) — phased build spec (source of truth)
- [CLAUDE.md](CLAUDE.md) — guidance for Claude Code
