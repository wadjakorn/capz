# Manual QA Checklist

Run this checklist before each `pnpm release`. Items here are NOT covered by Playwright (tier 1 mocks Tauri; tier 2 smoke is process-level only). Anything below depends on real OS behavior — hotkeys, screen capture, native dialogs, tray.

## Hotkeys

- [ ] `CmdOrCtrl+Alt+Shift+3` → full-screen capture fires, editor opens with image
- [ ] `CmdOrCtrl+Alt+Shift+4` → overlay opens, area drag captures, editor opens
- [ ] Rebind a hotkey in Settings → confirm new binding fires, old one no longer fires
- [ ] Re-register conflict: pick a combo already used by another app → toast surfaces failure, prior binding restored
- [ ] After update: shortcuts still registered (no re-onboarding needed unless TCC revoked)

## Overlay

- [ ] Drag-select rectangle highlights correctly across whole monitor
- [ ] Esc cancels overlay without capture
- [ ] Multi-monitor: overlay spans the active monitor only (v1 constraint)
- [ ] Window mode: hover highlights individual windows, click captures that window
- [ ] Full mode: clicking anywhere captures the whole monitor

## Tray

- [ ] Tray icon visible on macOS menu bar / Windows system tray
- [ ] Tray menu: capture-area / capture-full / settings / quit each work
- [ ] On macOS, tray menu appears on left-click (not just right-click)

## Capture pipeline

- [ ] Captured image opens in editor with correct dimensions (no DPR mismatch)
- [ ] Retina captures preserve pixelRatio 2 on export
- [ ] Multi-monitor: capture from secondary monitor uses correct geometry

## macOS TCC permissions

- [ ] Fresh install on a fresh user → onboarding prompts for Screen Recording
- [ ] Click "Open System Settings" → System Settings opens to Screen Recording pane
- [ ] After granting → "Relaunch" button appears, click → app relaunches
- [ ] After OS update or app update: inert-grant recovery dialog appears if permission was revoked
- [ ] Revoke permission while app running → capture surfaces actionable error toast

## File save / clipboard

- [ ] "Save" writes PNG to configured save path
- [ ] "Save As" opens native dialog, user-picked path works
- [ ] "Copy to clipboard" → paste into Preview / Slack / browser yields the same image
- [ ] "Save and copy" does both
- [ ] Default save dir: configurable, reveal-in-finder works

## Updater

- [ ] Updater check runs at startup (or per configured interval)
- [ ] Update available → toast/dialog offers install
- [ ] After update: **settings preserved** (regression of v0.5.0 wipe bug per [PROGRESS-BUG.md](../PROGRESS-BUG.md))
- [ ] After update on macOS: TCC permission state honored correctly (regression coverage)

## Editor (sanity)

- [ ] Tools: select / arrow / shapes / text / blur / pen / highlighter / magnify / sticker / pin all draw
- [ ] Undo/redo across all tools
- [ ] Sticker library loads custom dir from settings
- [ ] Text tool: bold/italic/underline/strikethrough/font family toggles; bg ON/OFF toggle + padding
- [ ] Arrow: 3-point curve handles; two-way head toggle; dashed toggle (straight + curved)
- [ ] Shapes tool: rect (corner radius) / circle / line options
- [ ] Pen: draw freehand; raw / polygon / curve smoothing modes re-shape the stroke
- [ ] Highlighter: translucent marker stroke, overlaps darken; color/width
- [ ] Magnify: place loupe; drag source + output handles; circle/rect shape; border color; zoom; **exports WYSIWYG**
- [ ] Pin numbering continues per settings.pins.continuityMode
- [ ] Rulers visible / hideable

## Windows (sanity, multi-window)

- [ ] Open editor + settings simultaneously — both render, no label clash
- [ ] Closing editor while overlay open does not orphan windows
- [ ] First-launch: only onboarding window shows; editor opens after onboarding finishes

## Cross-platform smoke (release only)

- [ ] macOS arm64 .dmg installs, launches, captures
- [ ] macOS x86_64 .dmg installs, launches, captures
- [ ] Windows .msi installs, launches, captures
