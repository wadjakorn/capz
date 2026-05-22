# capz

Cross-platform (macOS + Windows) screenshot capture & annotation desktop app. Runs in tray, captures full-screen or user-selected area via global hotkeys, opens an in-app editor (text, arrows, shapes, blur, stickers, numbered pins), outputs to file or clipboard.

## Stack

Tauri v2 · Rust · Next.js 15 (static export) · TypeScript · Tailwind 4 · shadcn/ui · Zustand · react-konva · `xcap` · `image`

## Status

Pre-implementation. Building per [PLAN.md](PLAN.md) phases 0–12.

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

## Docs

- [PLAN.md](PLAN.md) — phased build spec (source of truth)
- [CLAUDE.md](CLAUDE.md) — guidance for Claude Code
