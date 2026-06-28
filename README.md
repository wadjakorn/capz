# capz

Cross-platform (macOS + Windows) screenshot capture & annotation desktop app. Runs in tray, captures full-screen or user-selected area via global hotkeys, opens an in-app editor (text, arrows, shapes, blur, stickers, numbered pins), outputs to file or clipboard.

## Stack

Tauri v2 · Rust · Next.js 15 (static export) · TypeScript · Tailwind 4 · shadcn/ui · Zustand · react-konva · `xcap` · `image`

## Status

Shipping. macOS (arm64 + x64) + Windows (x64) builds released via GitHub. Active work in [PROGRESS-NEXT.md](PROGRESS-NEXT.md); Phase 0–16 build log archived at [docs/archive/PROGRESS-PHASES.md](docs/archive/PROGRESS-PHASES.md).

## Install

### macOS (recommended — Homebrew)

```bash
brew tap wadjakorn/capz
brew install --cask capz
```

Cask strips the quarantine attribute automatically — no Gatekeeper prompt.

### macOS (manual `.dmg`)

capz is **ad-hoc signed**, not notarized through the Apple Developer Program. On first launch macOS will block with *"capz cannot be opened because Apple cannot check it for malicious software"*.

Unblock once after install:

```bash
xattr -dr com.apple.quarantine /Applications/capz.app
```

Or via UI: **System Settings → Privacy & Security → "Open Anyway"** (scroll to the bottom of the Security section after the first blocked launch).

The Homebrew cask path avoids this — prefer it unless you need a specific build.

### Windows (`.msi` / `.exe`)

Builds are **unsigned** (no EV code-signing certificate). First run triggers SmartScreen:

> Windows protected your PC

Click **"More info" → "Run anyway"**. One-time per version. The app itself is fine; the warning reflects the absence of a paid Authenticode cert, not any actual issue with the binary.

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

Background updater polls `https://wadjakorn.github.io/capz/latest.json` (signed via Ed25519 minisign — independent of OS code-signing). Manual: Settings → Updates → Check now.

Homebrew-installed users get auto-updates seamlessly. Manual-install macOS users may need to re-run the `xattr` command above after an update if Gatekeeper re-quarantines the replaced bundle.

## Docs

- [PLAN.md](PLAN.md) — phased build spec (source of truth)
- [CLAUDE.md](CLAUDE.md) — guidance for Claude Code
- [docs/OCR-THAI-WINDOWS.th.md](docs/OCR-THAI-WINDOWS.th.md) — 🇹🇭 enabling Windows Thai OCR language pack (plain-Thai, for non-tech users)
