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
- [ ] Shapes tool: rect (corner radius) / circle / line / dashed-line options (multi-shape tool icon)
- [ ] Pen: pen-nib cursor at draw point; raw / polygon / curve modes; "Straighten"/"Curve" sliders (higher curve = rounder)
- [ ] Highlighter: translucent marker; wide default; move + width + opacity only (no resize handles); brush-pill cursor matches the drawn width; stays active for repeated strokes until Esc / another tool (pen too)
- [ ] Tool settings persist across app restarts (draw with custom pen/highlighter/magnify options, relaunch, defaults retained)
- [ ] Arrow/line: dashed toggle shows a dashed-line icon (not "Dash" text)
- [ ] Magnify: first drag sets the magnify (source) area; loupe appears beside it; both source area and loupe are clickable/draggable with live feedback; source + output resize handles show live preview; circle/rect; border color; zoom; Area-opacity slider (0 = hide source box for a clean capture); link line normal/dotted toggle; **exports WYSIWYG**
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
