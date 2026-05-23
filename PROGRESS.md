# Progress

Tracks phase completion + deviations from [PLAN.md](PLAN.md). Update as phases land.

## Phases

- [x] Phase 0 — bootstrap (Tauri+Next scaffold, Tailwind 4, shadcn, static export)
- [x] Phase 1 — tray menu wiring
- [x] Phase 2 — settings window + config store
- [x] Phase 3 — global hotkey registration
- [x] Phase 4 — screen capture service
- [x] Phase 5 — area-selection overlay
- [x] Phase 6 — image editor
  - [x] 6a editor window spawner + skeleton
  - [x] 6b state store + toolbar
  - [x] 6c basic tools (text, arrow, rect)
  - [x] 6d blur + sticker
  - [x] 6e numbered pin + continuity
  - [x] 6f acceptance + commit
- [x] Phase 7 — output (file/clipboard/both)
- [x] Phase 8 — multi-source capture (multi-monitor area + full-screen picker + window picker)
- [x] Phase 9 — editor live controls + session memory (live stroke/color/size, remember last-used)
- [x] Phase 10 — dedicated copy action (Ctrl+C + Copy button separate from Save)
- [x] Phase 11 — persistent editor workspace (single-instance, hide-on-close, paste-from-clipboard, empty state)
- [x] Phase 12 — onboarding (TCC)
- [x] Phase 13 — autostart
- [x] Phase 14 — polish/logging (14a logging+sound+About, 14b sonner+notice channel, 14c error classification)
- [x] Phase 15 — packaging/signing (CI builds wired 2026-05-23; signing/notarization deferred — ad-hoc sign, Gatekeeper bypass via brew cask)
- [x] Phase 16 — updater + ship (16a scaffolded, 16b pubkey + secrets + background scheduler done; v0.1.2 released via brew tap, auto-update smoke test deferred — no older build available)

## Deviations from PLAN.md

Things added or changed during build that PLAN.md did not specify. Cross-reference when planning later phases.

### Phase 6

- **`tools` config block** (new). PLAN.md §2 schema only had `pins.defaultColor/defaultSize`. Extended `AppConfig.tools` with `strokeColor`, `rect.strokeWidth`, `arrow.strokeWidth`, `text.fontSize`, `text.color`, `blur.blurRadius`, `sticker.fontSize`. File: [src/lib/config.ts](src/lib/config.ts).
- **Settings "Tools" tab** (new). PLAN.md §2 tabs list = Shortcuts / Output / Pins / General. Added Tools tab for the block above. File: [src/app/settings/page.tsx](src/app/settings/page.tsx).
- **Settings global "Saved" flash toast** (UX, not specced). Watches config signature, flashes top-right chip on any change.
- **Toolbar pin row inline flash toast** (UX, not specced). Feedback for Save/Clear/Continue/Next-input.
- **Pin toolbar: Save + Clear replace single "Reset" button** (semantic change). PLAN.md §6 line 697 specced one `Reset` → counter = defaultStartNumber. Split:
  - `Save` = persist current as `lastUsedNumber` (no UI counter change).
  - `Clear` = reset persisted `lastUsedNumber = defaultStart-1` + flip `continuityMode = 'reset'` + reset session counter.
- **Toolbar "Next" number input** (new). Manual override of session counter mid-canvas. Not in PLAN.
- **Pin counter wired to undo/redo** via `Snapshot = {annotations, nextPinNumber}`. PLAN.md §6 didn't specify counter atomicity with action stack.
- **`editor.json` capability granted `store:default`**. PLAN.md §6 capability list omitted; needed because editor reads `pins.*` defaults from store. File: [src-tauri/capabilities/editor.json](src-tauri/capabilities/editor.json).
- **Inline color picker in editor toolbar** (new UX). PLAN.md §6 only specified per-tool default colors via Settings. Toolbar now exposes a context-sensitive color input: edits the selected annotation when one is selected (rect/arrow `stroke`, text `fill`, pin `color`), else writes the default for the active tool back to settings. File: [src/components/editor/Toolbar.tsx](src/components/editor/Toolbar.tsx).
- **Init-once guard pattern** in `EditorStage` for async settings load (`pinInit` ref). Prevents re-derivation overwriting session counter on subsequent settings mutations. PLAN.md didn't address bootstrap order.

### Phase 5 — fix 2026-05-22

- **Overlay span fix.** Original Phase 5 overlay only covered the primary monitor (PLAN.md §5.2 specified union of all monitors). First attempt used `PhysicalPosition/Size` on a single window spanning the virtual desktop — broken on macOS because xcap's `Monitor::x/y/width/height` return **CG points (logical)**, not physical pixels (see [`xcap-0.9.4/src/macos/impl_monitor.rs:146`](https://docs.rs/xcap/0.9.4/) → reads `CGDisplayBounds`). Passing points to `PhysicalPosition` mis-scaled the window. Phase 5's original code only worked because of an NSScreen `setFrame:screens[0]` hack that pinned the window to primary.
- **Final approach: per-monitor overlay windows.** [src-tauri/src/windows.rs](src-tauri/src/windows.rs) `show_overlay` now enumerates `list_monitors()` and spawns one window per monitor, labeled `overlay-<CGDirectDisplayID>`, positioned via `LogicalPosition/LogicalSize` using xcap's already-point values. Sidesteps cross-monitor coordinate math entirely. macOS NSWindow level=1000 + collectionBehavior applied per window.
- **`close_overlay` and `capture_region_command`** updated to close any window whose label matches `overlay-*` (or legacy `overlay`).
- **Capability scope:** [src-tauri/capabilities/overlay.json](src-tauri/capabilities/overlay.json) `windows` glob changed `"overlay"` → `"overlay-*"`.
- **Frontend** ([src/app/overlay/page.tsx](src/app/overlay/page.tsx)) reverted to single-monitor logic: reads `?monitor=<id>` from URL, sends `capture_region_command(monitorId, x, y, w, h)` with window-local logical coords.
- **Hover-activate UX.** Each overlay tracks `active` state via `onPointerEnter`/`onPointerLeave` + `onMouseMove` fallback (covers cursor already inside at spawn). Active: 0.35 dim, crosshair, sky-400 inset border, "Drag to select" hint. Inactive: 0.12 tint, default cursor, "Move cursor here…" hint. `onPointerEnter` calls `getCurrentWindow().setFocus()` so Esc routes to hovered screen.
- **macOS cursor-poll auto-focus.** macOS only delivers mouse events to focused NSWindow, so crossing a bezel required a click to wake the next overlay. Fix: Rust spawns a `tauri::async_runtime` task that polls `NSEvent.mouseLocation` every 40ms, converts NS bottom-left → CG top-left (`h_primary - ns_y`), hit-tests against xcap monitor rects, calls `set_focus` on matching overlay when label changes. Loop exits when no `overlay-*` windows remain.
- **Cross-platform position/size.** xcap coordinate semantics differ by OS:
  - macOS: `Monitor::x/y/width/height` = CG **points** (logical). Use `LogicalPosition`/`LogicalSize`.
  - Windows: `dmPosition` / `dmPelsWidth` = **physical pixels** (DEVMODE). Use `PhysicalPosition`/`PhysicalSize`.
  - Linux: same as Windows (physical). Untested; PLAN.md targets macOS/Windows.
- **Auto-focus polling is macOS-only.** Windows delivers `WM_MOUSEMOVE` regardless of focus, so `pointerenter` fires naturally without polling.
- **Windows verification still TODO** — code path believed correct (xcap physical → `Physical*` → Webview2 viewport in CSS px = logical) but no Windows hardware available for this commit.

### Phase 8

- **Unified overlay UX (2026-05-23 rework).** PLAN.md §Phase 8 specced separate `monitor-picker` and `window-picker` thumbnail-grid windows. User feedback after the initial cut: wrong UX — wanted the area-overlay metaphor extended to full + window modes. Rewrote: one overlay route handles three modes via `?mode=area|full|window` param.
  - **`area`**: drag rect → `capture_region_command` (unchanged from Phase 5).
  - **`full`**: per-monitor overlay; click anywhere on the active monitor → `capture_full_monitor(monitor_id)`.
  - **`window`**: per-monitor overlay; on mount the frontend fetches `list_capture_windows(monitor_id)`; hover hit-tests against cached bounds and outlines the topmost window (title/app tag); click → `capture_window_command(window_id)`.
- **Picker code removed entirely.** Deleted `windows::show_monitor_picker` / `show_window_picker`, all picker IPC commands (`list_monitors_with_thumbs`, `list_windows_with_thumbs`, `capture_monitor_from_picker`, `close_picker_command`, `show_*_picker_command`), `capabilities/monitor-picker.json`, `capabilities/window-picker.json`, `src/app/picker/`. Thumbnail helper + `base64` crate dep also removed.
- **`list_capture_windows(monitor_id)`** ([src-tauri/src/commands/pickers.rs](src-tauri/src/commands/pickers.rs)) returns `WindowOverlayInfo` filtered to: not own pid, not minimized, non-zero area, has title or app_name, `current_monitor().id() == monitor_id`. Bounds converted to **monitor-local logical coords** (`x - monitor.x`, `y - monitor.y`) so the overlay can hit-test in its own viewport space. Macos `xcap::Window::all()` returns front-to-back (confirmed against `xcap-0.9.4/src/macos/impl_window.rs:172`); frontend iterates index 0 onward for topmost.
- **`capture_full_monitor` + `capture_window_command`** both close all `overlay-*` windows + sleep 150ms before invoking `capture_to_editor`. Matches the existing `capture_region_command` close-before-grab pattern so the overlay never lands in the output frame.
- **Smart full dispatch removed.** Earlier draft branched on monitor count (1 → direct capture, 2+ → picker). With overlay UX there's no special case: tray and hotkey always show the overlay. `capture_dispatch::dispatch_full` / `dispatch_window` are thin wrappers around `show_overlay_mode`.
- **Hotkey: `CmdOrCtrl+Alt+Shift+5`** → window-mode overlay. Stored as `hotkeys.captureWindow` in `config.json`. Settings UI not yet exposed (Phase 9/14 will surface it).
- **`xcap::Window` no icon support.** PLAN.md listed `icon?` in WindowInfo — xcap 0.9.4 doesn't expose it. Field omitted; not on the acceptance list.
- **Area capture cross-monitor restriction lifted in Phase 5.** Per-monitor overlay windows already cover all monitors and route capture via the monitor under the cursor — task 3 needed no code change in Phase 8.

### Phase 11

- **Fixed window label.** Per-capture `editor-<ts>` collapsed to single `editor`. Capability glob in [src-tauri/capabilities/editor.json](src-tauri/capabilities/editor.json) tightened to exact match.
- **Workspace state is process-local.** `state::AppState.active_temp_path: Mutex<Option<PathBuf>>` tracks the active temp PNG. `swap()` returns the prior path so the caller can `fs::remove_file` it. Tray Quit drains the slot and deletes before `app.exit(0)`. No disk persistence by design (PLAN.md §Phase 11 motivation).
- **Image load is event-driven.** Dropped `?file=` URL param. Rust `windows::load_editor_image` (1) swaps state, (2) removes prior temp, (3) calls `show_editor` (idempotent), (4) `app.emit_to("editor", "editor:load-image", path)`. Frontend listens in [src/app/editor/page.tsx](src/app/editor/page.tsx).
- **Cold-start seeding.** On mount, the editor invokes `editor_current_image` (Rust state) so a window opened *after* a capture still picks up the active image. Avoids event-vs-listener race.
- **Paste lives in Rust.** `paste_into_editor` command uses `ClipboardExt::read_image()`, encodes RGBA → PNG via `image::PngEncoder`, writes `capz-temp-<ts>.png`, then routes through `load_editor_image`. Avoids JS-side PNG encoding (would otherwise need pure-JS encoder or canvas roundtrip).
- **Hide-on-close.** `onCloseRequested` → `e.preventDefault(); win.hide()`. Annotations + active image persist in memory until tray Quit. Permission `core:window:allow-hide` added.
- **Tray menu.** `Open Editor` (always enabled) calls `show_editor` (creates empty if no window, else show + focus). `Quit capz` drains state + removes temp + exits.
- **Empty state.** When `editor_current_image` returns null and no event fired, page renders `<EmptyState/>` with paste-hint. `EditorStage` not mounted (skips Konva init).
- **Store `reset()`** added to [src/stores/editor.ts](src/stores/editor.ts) — wipes annotations / undo stack / pin counter / selection. Existing `clear()` early-returns when annotations empty, doesn't touch history; not suitable for cross-image reset.
- **Cache-busting `src` URL** (`convertFileSrc(path)?t=<ts>`) so a *replaced* temp file at the same path still triggers a reload. (Currently each capture/paste produces a new timestamped path, so collisions are unlikely — defensive.)
- **Clear Workspace** *(spec task 9)* deferred. Replace-on-load + tray-Quit cleanup cover the v1 use cases per user decision 2026-05-23.

### Phase 7

- **`output.defaultMode` union changed** from PLAN.md's `"file" | "clipboard" | "ask"` to **`"file" | "clipboard" | "both"`**. Resolved §9: no modal prompt, deterministic behavior. Default = `clipboard`.
- **Export pipeline runs entirely client-side** via Konva `stage.toDataURL` → bytes → `@tauri-apps/plugin-{dialog,fs,clipboard-manager}`. No Rust export commands. Avoids cross-boundary buffer copies for already-canvas data.
- **`pixelRatio = 1 / stage.scaleX()`** on export so output dimensions equal the source image's natural (physical) pixels regardless of fit-to-window scale. Overrides PLAN.md §5.1 generic `pixelRatio: 2`.
- **Stage handoff via module-level singleton** `src/lib/stageBridge.ts` (set in `EditorStage`, read in `Toolbar`). Keeps Konva node out of zustand (non-serializable, would inflate snapshots).
- **Temp PNG cleanup on editor window close** wired in `src/app/editor/page.tsx` via `onCloseRequested` → `plugin-fs.remove(file)` → `window.destroy()`. PLAN.md §5.5 specified the behavior, this is the implementation point.
- **Startup sweep enabled** — removed `#[allow(dead_code)]` on `sweep_stale_temp` and called it from `lib.rs` setup.
- **`general.copyToClipboardAfterSave`** is honored only when `defaultMode === "file"` (when `both` is selected, clipboard write already happens).

### Phase 9

- **`effectiveTools(config)` helper in [src/lib/config.ts](src/lib/config.ts)** — overrides `tools.*` with `lastUsed` values when `general.rememberLastTool` is on. Editor + Toolbar both read through it so live tool state reflects the last session.
- **`lastUsed` block on AppConfig** persists tool, color, strokeWidth, fontSize, stickerEmoji, stickerFontSize. Written 500 ms after each annotation commit via debounced `scheduleLastUsedWrite` in [src/components/editor/EditorStage.tsx](src/components/editor/EditorStage.tsx). Hydrated once on editor mount (overrides `tools.*`).
- **`general.rememberLastTool`** Settings toggle (default true). When off, sliders write to `tools.*` defaults instead of `lastUsed`.
- **Implicit selection via cancelBubble** — every annotation node now calls `ctx.onSelect()` on `mousedown` regardless of active tool, and is `draggable={true}`. Stage's `handleMouseDown` only initiates a new draft when target is `isEmptyTarget` (stage or `bg-image`). Removes the need for an explicit Select tool.
- **Transformer attaches whenever `selectedId` is set**, not gated on `tool === "select"`. `rotateEnabled: true` with 15° snap step. Pin annotation counter-rotates its numeral (`offsetX/offsetY` + negative rotation) so the digit stays upright.
- **Rotation field on all annotation types** (`Base.rotation?: number`). On `transformEnd`, every shape writes back `rotation: node.rotation()` so undo/redo and PNG export honor the rotation via Konva's native transform.
- **Toolbar keyboard shortcuts** `[`/`]` (±width when widthCtx active), `-`/`+`/`=` (±size when sizeCtx active), `C` (focus color picker via hidden click). Handlers live inside Toolbar so they see the same `widthCtx`/`sizeCtx` derivation as the sliders. Suppressed when focused element is `INPUT`/`TEXTAREA`/contentEditable.
- **Inline color picker + sliders behavior** — when an annotation is selected, the slider writes to the annotation; otherwise it writes to either `lastUsed` (remember on) or `tools.*` (remember off). Pin defaults stay on `config.pins` because they live outside the `tools` block.

### Phase 9.1 — selection UX polish + per-tool persistence (2026-05-23)

- **Per-tool color split** — `tools.strokeColor` removed. Now `tools.rect.strokeColor`, `tools.arrow.strokeColor`, `tools.text.color`, plus `pins.defaultColor`. Each tool keeps its own next-drawn color.
- **`lastUsed` restructured to per-tool delta map** — `{ tool?, stickerEmoji?, rect?, arrow?, text?, blur?, sticker?, pin? }`. Editing any annotation writes to that annotation's slot via `lastUsedPatchForAnnotation()`. Old flat `lastUsed` payload is dropped on load (best-effort migration).
- **`effectiveTools()` returns full per-tool shape** including `pin: { color, size }` (overlays `pins.defaultColor`/`defaultSize`). Single consumer surface for editor + toolbar.
- **Width / size sliders hidden when no selection** — toolbar only renders the slider for the active tool when an annotation is selected. Color picker stays visible for tool default + emoji picker stays for sticker tool.
- **Hover-to-highlight any element with any tool** — per-shape `onMouseEnter/Leave` sets `hoveredId`; a second resize-disabled `Transformer` (sky-400 border) attaches to the hovered node. Cursor switches to `pointer`. Hover indicator suppressed when target == selection.
- **Empty-canvas mousedown deselects in every tool** — previously only the `select` tool cleared `selectedId` on empty click. Now all tools deselect first, then continue with their tool-specific behavior (rect/arrow/blur start a draft, text/sticker/pin add).

### Phase 9.1 follow-ups (2026-05-23)

- **Tool defaults restored for no-selection** — width slider (rect/arrow/blur) + size slider (text/sticker/pin) now render even without a selected annotation, so the user can dial defaults before drawing the first element. Earlier 9.1 hid them; was reported as bug.
- **`tauri-plugin-store` autoSave off, explicit `store.save()` per write** — `autoSave: true` debounces ~100 ms, which races a new editor window opening for the next capture. Switched to `autoSave: false` + awaited `save()` in `update`/`setLastUsed`/`reset` so `pins.lastUsedNumber` + `lastUsed.pin.color` are flushed to disk before the next window's `load()` reads them.
- **Pin counter persisted across `applyFile` (Phase 11 single-editor)** — `useEditor.reset()` was zeroing `nextPinNumber` on every new image load, defeating `continuityMode: "continue"`. Removed `nextPinNumber: 1` from `reset()`; `editor/page.tsx applyFile` now re-derives the counter from `pins.continuityMode` + `pins.lastUsedNumber` after every image swap (cold-start + new capture + clipboard paste). `EditorStage` `pinInit` retained as cold-mount fallback.

### Phase 10 — dedicated copy action (2026-05-23)

- **`exportImage.ts` split.** Old monolithic `exportAnnotated` (mode-driven branching) replaced by three explicit actions: `copyOnly(stage)`, `saveOnly(stage, config)`, `saveAndCopy(stage, config)`. `saveOnly` still honors `general.copyToClipboardAfterSave` (Phase 7 behavior preserved). `exportAnnotated` removed; no remaining callers.
- **Toolbar: three buttons replace single Save.** [src/components/editor/Toolbar.tsx](src/components/editor/Toolbar.tsx) renders `Copy` / `Save` / `Save & Copy`. Primary emerald highlight tracks `output.defaultMode` (`clipboard` → Copy, `file` → Save, `both` → Save & Copy). Non-primary buttons remain enabled but neutral-styled.
- **`ExportAction` type local to Toolbar.** `"copy" | "file" | "both"` drives `doExport`. Toast strings: `Copied` / `Saved` / `Saved & Copied`.
- **Editor-window `CmdOrCtrl+C` handler** ([src/app/editor/page.tsx](src/app/editor/page.tsx)). Conditions to suppress (let native copy through):
  - Modifier mismatch (Shift/Alt held).
  - No image loaded (`file === null`).
  - Focus inside `INPUT` / `TEXTAREA` / contentEditable.
  - `window.getSelection().toString().length > 0` (a text range is highlighted somewhere on the page).
- **Lazy imports** in keydown handler avoid loading Konva-touching modules until the shortcut actually fires (matches the existing paste handler's dynamic-import pattern).
- **No new capabilities.** Clipboard write already granted in [src-tauri/capabilities/editor.json](src-tauri/capabilities/editor.json) from Phase 7.

### Phase 10.1 — default save destination + reveal folder (2026-05-23)

User enhancement on top of Phase 10: drop the per-save file dialog; persist a default destination and expose "Open folder" in Settings.

- **Rust `commands/output.rs`** (new). Two commands registered in [src-tauri/src/lib.rs](src-tauri/src/lib.rs):
  - `default_save_dir(app) -> String` — returns `<Pictures>/Capz` via `app.path().picture_dir()`. Does **not** mkdir (rule: user-facing writes go through `plugin-fs`, not raw `std::fs`).
  - `reveal_in_finder(path) -> ()` — spawns `open` (macOS) / `explorer` (Windows). Frontend mkdirs before invoking.
- **`exportImage.ts saveToFile` rewritten.** No `plugin-dialog save({...})`. Resolves dir from `output.defaultSavePath`, falling back to `invoke("default_save_dir")`. Uses `plugin-fs mkdir({recursive: true})` if missing, then writes via `writeFile`. Filename collision strategy: `name.ext` → `name-1.ext` → `name-2.ext` (existence-checked through `plugin-fs exists`). Path join via `@tauri-apps/api/path`.
- **`stores/settings.ts init` resolves + persists** the OS default on first launch when `output.defaultSavePath` is null — store gets a concrete path, Settings UI never shows empty, capture pipeline never hits a missing-default branch.
- **`components/settings/OutputPrefsForm.tsx`** new "Save destination" row: readonly path Input + `Choose…` (`plugin-dialog open({directory:true})`) + `Open folder` (invokes `reveal_in_finder`; mkdirs first so a stale-path setting still opens cleanly).
- **Capability changes**:
  - [src-tauri/capabilities/editor.json](src-tauri/capabilities/editor.json): removed `dialog:allow-save` (no save dialog anymore); added `fs:allow-mkdir`, `fs:allow-exists`.
  - [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json) (settings window): added `dialog:allow-open`, `fs:allow-mkdir`, `fs:allow-exists`, and `fs:scope` mirroring editor scope ($HOME, $DESKTOP, $DOCUMENT, $DOWNLOAD, $PICTURE).
- **Linux fallthrough.** `reveal_in_finder` returns `Err("unsupported platform")` outside macOS/Windows — matches v1 cross-platform scope (macOS/Windows only) per CLAUDE.md.

### Phase 12 — first-launch onboarding (2026-05-23)

- **Config flag** `general.onboardingCompleted: boolean` (default false) added in [src/lib/config.ts](src/lib/config.ts). Drives gate logic.
- **Rust `commands/permissions.rs`** (new). Four commands registered in [src-tauri/src/lib.rs](src-tauri/src/lib.rs):
  - `has_screen_recording_permission()` — macOS calls `CGPreflightScreenCaptureAccess` via `#[link(name="CoreGraphics", kind="framework")]` extern (no build.rs change, no extra crate). Non-mac returns `true`.
  - `request_screen_recording_permission()` — `CGRequestScreenCaptureAccess`. Triggers TCC dialog on first call.
  - `open_system_settings_screen_recording()` — macOS deep link `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture` via `open`. Non-mac returns Err.
  - `relaunch_app(app)` — calls `AppHandle::restart()`. Avoids pulling `tauri-plugin-process`.
- **`windows::show_onboarding`** added in [src-tauri/src/windows.rs](src-tauri/src/windows.rs) — non-resizable 640×520 window labeled `onboarding`.
- **Gate at setup** in [src-tauri/src/lib.rs](src-tauri/src/lib.rs): `is_onboarding_completed(app)` reads `config.json` via `StoreExt` (same pattern as `shortcuts.rs`). If false, `show_onboarding` opens. Tray + global shortcuts register regardless, so user can capture even before finishing onboarding (skip path).
- **`src/app/onboarding/page.tsx`** (new). 3 steps: Welcome → Permission (macOS only — auto-skipped on Windows) → Done. Permission step shows status badge (unknown / granted / not granted) and 4 actions: Request permission, Open System Settings, Re-check, Relaunch capz. Welcome step shows platform-aware hotkey hints (⌘⌥⇧ vs Ctrl+Alt+Shift+). Done step finalizes by `update("general", { onboardingCompleted: true })` then closes the window via `getCurrentWindow().close()`.
- **Capability** [src-tauri/capabilities/onboarding.json](src-tauri/capabilities/onboarding.json) — minimum scope (`core:default`, `core:event:default`, `core:window:default`, `core:window:allow-close`, `core:webview:default`, `store:default`). Custom app commands (`has_screen_recording_permission` et al.) are not capability-gated in Tauri v2 — only plugin commands are.
- **Skip semantics.** "Skip for now" button advances to Done without granting; capture pipeline still works for clipboard mode or screens that don't require TCC. macOS denies actual screen capture until granted — surfaced via existing capture-error toast.
- **Re-entry.** Mid-flow quit: next launch re-opens onboarding (flag still false). After finish: flag true → tray-only path; user can still access Settings via tray. No tray "Re-open onboarding" entry — kept menu minimal; user can manually clear the flag from Settings → Debug if needed (future enhancement).

### Phase 13 — autostart (2026-05-23)

- **Plugin** `tauri-plugin-autostart` added via `pnpm tauri add autostart` (auto-wired Cargo dep, npm dep `@tauri-apps/plugin-autostart`, capability `autostart:default` in [src-tauri/capabilities/desktop.json](src-tauri/capabilities/desktop.json)).
- **macOS launcher** explicit: replaced generated `Builder::new().build()` with `init(MacosLauncher::LaunchAgent, Some(vec![]))` in [src-tauri/src/lib.rs](src-tauri/src/lib.rs). LaunchAgent path = `~/Library/LaunchAgents/<bundle-id>.plist` — user-scope, no admin.
- **Settings wiring** in [src/app/settings/page.tsx](src/app/settings/page.tsx):
  - On `ready` boot, query `isEnabled()` from plugin (OS = source of truth) and reconcile store if drifted.
  - Toggle handler `applyAutostart(v)` calls `enable()` / `disable()` then writes store. Errors logged but don't roll back UI — user re-toggles.
- **No onboarding wiring.** PLAN.md §13 mentions "and onboarding" optionally; deferred — Settings sufficient for acceptance + reduces onboarding clutter.

### Phase 14a — logging + capture sound + About (2026-05-23)

- **Always-on file logging** in [src-tauri/src/lib.rs](src-tauri/src/lib.rs). `tauri-plugin-log` writes to OS log dir (`~/Library/Logs/dev.baze.capz/` macOS, `%LOCALAPPDATA%\dev.baze.capz\logs\` Windows) + stdout. Level: Info in debug, Warn in release. 1 MB rotation, `KeepAll` strategy. Replaces previous debug-only registration.
- **Capture sound** [src-tauri/src/services/sound.rs](src-tauri/src/services/sound.rs). Originally tried Web Audio API in editor page — failed because the editor webview is often hidden/unfocused when a capture lands and autoplay policy holds AudioContext suspended without prior user gesture. Moved server-side: `play_capture_sound(app)` reads `general.playSoundOnCapture` from store via `StoreExt`, shells out to `afplay /System/Library/Sounds/Tink.aiff` on macOS and `powershell ... [System.Media.SystemSounds]::Asterisk.Play()` on Windows. Fire-and-forget spawn — no wait, no extra crate. Called from `windows::load_editor_image` after the load-image emit.
- **About row** in Settings → General. Reads `getVersion()` + `getTauriVersion()` from `@tauri-apps/api/app`, renders `vX.Y.Z · Tauri X.Y.Z · <platform>` under the "Re-run onboarding" row.
- **Deferred to Phase 14b:** Sonner toasts replacing inline `setToast`; surfacing hotkey-registration failures (currently only `log::error!`); recovery flow for capture-permission revoked mid-session; disk-full handling on save.

### Phase 14b — Sonner toasts + cross-window notice channel (2026-05-23)

- **`sonner@2`** added. `<Toaster theme="dark" position="top-right" richColors closeButton />` mounted in editor + settings pages (separate React trees per Tauri window — Toaster must live in each).
- **Editor inline toast removed.** Previous `useState<string|null>(toast)` + absolutely-positioned div replaced with sonner `toast()/.success()/.error()` calls. Toolbar `flash/setFlash/notify` shim replaced with `notify = (msg) => toast(msg)`; trailing ml-auto flash span removed.
- **Settings "Saved" badge** replaced with `toast.success("Saved", { duration: 1400 })`.
- **Rust→frontend notice channel** in [src-tauri/src/notice.rs](src-tauri/src/notice.rs). Emits `app:notice` event with `{ kind: "info"|"success"|"error", message }`. Frontend hook `useNoticeListener()` in [src/lib/notice.ts](src/lib/notice.ts) subscribes and routes by kind.
- **Wired emitters:**
  - `capture_to_editor` failure paths (both the inner capture error and the join error) emit `notice::error` so hotkey/tray-driven captures surface failures even when no frontend command is in flight.
  - `register_shortcuts` failure at setup emits `notice::error` (was log-only before).
- **`NoticeKind::Info` and `Success`** kept as `#[allow(dead_code)]` — public surface for future callers (no current Rust emitters use them; frontend handles `toast()` and `toast.success()` directly).

### Phase 14c — export error classification (2026-05-23)

- **[src/lib/exportErrors.ts](src/lib/exportErrors.ts)** `describeExportError(e)` returns `{ title, detail }`. Pattern-matches lowercased message for: disk full ("no space left", "disk full", "not enough space"), permission denied ("permission denied", "not permitted", "access is denied", "os error 13"), read-only volumes, clipboard. Fallback `Export failed` with raw detail.
- **Toolbar.doExport** catch now `toast.error(title, { description: detail })`. Previously single-line plain toast.
- **Editor copy-shortcut** catch uses same classifier via dynamic import.
- **Recovery action deferred.** A "Pick folder" toast action that opens Settings → Output would need a `show_settings_command` Tauri command + window-focus tab plumbing — punted; user can open Settings via tray.

### Phase 15 — interim CI + free-distribution (2026-05-23, partial)

Full signing/notarization deferred (Apple Developer Program $99/yr not funded). Interim path landed so artifacts ship now and Phase 15 proper can layer on later.

- **`.github/workflows/build.yml`** matrix:
  - `macos-latest` → `aarch64-apple-darwin`
  - `macos-13` → `x86_64-apple-darwin` (Intel — `macos-latest` is ARM-only)
  - `windows-latest` → `x86_64-pc-windows-msvc`
- **Tag-triggered release.** `push: tags: v*` runs the matrix through `tauri-apps/tauri-action@v0` (replaces the prior `pnpm tauri build` + separate `release` job). The action signs updater artifacts, creates/updates a **draft** GitHub Release per `tagName: ${{ github.ref_name }}`, uploads all bundles + `.sig` files, and — with `includeUpdaterJson: true` — generates and uploads `latest.json` consumed by `tauri-plugin-updater`. `workflow_dispatch` runs the same job with an empty `tagName`, so the action builds without touching the release; `actions/upload-artifact` still publishes bundles to the run for smoke-testing.
- **Secrets.** `TAURI_SIGNING_PRIVATE_KEY` + `..._PASSWORD` populated 2026-05-23. CI emits signed updater bundles + `latest.json`.
- **Homebrew Cask** ([packaging/homebrew-cask/capz.rb](packaging/homebrew-cask/capz.rb)) pulls dual-arch DMGs from GitHub Releases. `postflight` runs `xattr -dr com.apple.quarantine` so unsigned DMG opens without the Gatekeeper "could not verify" prompt on Sequoia 15+. README ([packaging/homebrew-cask/README.md](packaging/homebrew-cask/README.md)) documents personal-tap (`wadjakorn/homebrew-capz`) vs official `Homebrew/homebrew-cask` PR trade-offs.
- **Windows**: MSI + NSIS unsigned. SmartScreen warns first run → "More info → Run anyway". EV code-sign cert (~$300/yr) deferred with macOS notarization.
- **Remove later.** Once Phase 15 proper ships: delete `postflight xattr` from cask, add `xcrun stapler staple` step to release job, swap matrix to `--target universal-apple-darwin` before `macos-13` deprecates (Q4 2026 per GitHub roadmap).

## Phase renumbering — 2026-05-23

Inserted new Phase 11 (Persistent Editor Workspace) after the existing Phase 10. Previous 11–15 shifted to 12–16. Mapping:

| Old | New | Title |
| --- | --- | --- |
| —   | 11  | Persistent Editor Workspace |
| 11  | 12  | First-Launch Onboarding & macOS Permissions |
| 12  | 13  | Autostart Integration |
| 13  | 14  | Polish, Logging, Error Handling |
| 14  | 15  | Packaging & Distribution |
| 15  | 16  | Auto-Update |

Driver: tray-driven single-instance editor that survives close (hide-only), supports clipboard-paste as input source, has an empty/idle state, and only truly tears down on app quit. Implications:
- Editor window label collapses `editor-<ts>` → fixed `editor`.
- `?file=` query param replaced by `editor:load-image` Tauri event.
- Phase 7 `closeEditorAfterExport` semantics reinterpreted as hide.
- Phase 9 `lastUsed` re-hydrates per image load instead of per window mount.
- Phase 10 `CmdOrCtrl+C` no-op when stage empty.

## Phase renumbering — 2026-05-22

Inserted three new phases (8/9/10) refining a user brief; previous 8–12 shifted to 11–15. Mapping:

| Old | New | Title |
| --- | --- | --- |
| —   | 8   | Multi-Source Capture (Monitors + Windows) |
| —   | 9   | Editor Live Controls + Session Memory |
| —   | 10  | Dedicated Copy Action |
| 8   | 11  | First-Launch Onboarding & macOS Permissions |
| 9   | 12  | Autostart Integration |
| 10  | 13  | Polish, Logging, Error Handling |
| 11  | 14  | Packaging & Distribution |
| 12  | 15  | Auto-Update |

Source brief (verbatim, then refined):
1. multi-monitor area capture + full-screen capture monitor picker → folded into Phase 8 alongside…
2. specific window capture → …window-picker IPC + UI in same phase (shared `xcap` enumeration code path).
3. adjust stroke width on the fly in editor → Phase 9 toolbar slider, edits selection or default depending on context (matches existing inline-color-picker pattern from Phase 6 deviations).
4. adjust color on the fly → Phase 9, already partly delivered in Phase 6; phase formalizes + adds keyboard shortcut.
5. remember last tool/color/width/etc for next capture → Phase 9 `config.lastUsed` block with `general.rememberLastTool` toggle.
5a. (added 2026-05-22) implicit selection — click any element with any tool selects it, no Select tool needed → Phase 9.
5b. (added 2026-05-22) auto-select latest placed element → Phase 9, transformer attaches on commit.
5c. (added 2026-05-22) all elements rotatable → Phase 9, `rotation` field on every annotation; pin numeral counter-rotates to stay upright.
6. Ctrl+C copy + button separate from Save → Phase 10 dedicated Copy action with editor-scoped `CmdOrCtrl+C` handler; splits Save/Copy/Save&Copy.

### Phase 16a — updater plugin scaffold (2026-05-23)

- **Plugins added.** `tauri-plugin-updater` + `tauri-plugin-process` via `pnpm tauri add`. Capability `updater:default` auto-added to `desktop.json`; `process:allow-restart` added manually (process plugin doesn't auto-wire capability).
- **`AppConfig.updates`** field — `autoCheck: bool`, `checkIntervalHours: number`, `channel: "stable" | "beta"`, `skippedVersion: string|null`, `lastCheckedAt: number|null`. Merger in `stores/settings.ts` extended.
- **`src/lib/updater.ts`** — `checkForUpdates()` wraps `@tauri-apps/plugin-updater` and returns uniform `{ kind }` discriminated union; `promptAndInstall(available)` opens native `ask` dialog (Install / Later), runs `downloadAndInstall` + `relaunch` on confirm; `skipVersion(v)` writes to store and is honored by promptAndInstall.
- **Settings → Updates tab.** Toggle for auto-check, interval selector (6h / 24h / 7d), "Check now" button, last-checked timestamp, skipped-version display with Clear.
- **`tauri.conf.json`** — `bundle.createUpdaterArtifacts: true`; `plugins.updater.endpoints: ["https://github.com/wadjakorn/capz/releases/latest/download/latest.json"]`; `pubkey: ""` placeholder; Windows `installMode: "passive"`.

### Phase 16b — pubkey + background scheduler (2026-05-23)

- **Ed25519 pubkey** pasted into `tauri.conf.json` `plugins.updater.pubkey` (single-line base64 minisign blob). Private key + password stored in secrets manager + GitHub Actions secrets (`TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
- **Background auto-check scheduler** in [src-tauri/src/lib.rs](src-tauri/src/lib.rs):
  - `read_update_prefs(app)` reads `updates.{autoCheck, checkIntervalHours}` from store with safe defaults `(true, 24)`. Min interval clamped to 1h.
  - `spawn_update_checker(app)` spawns tokio task: 30s startup delay, then loop emits `updater://check-now` per interval if `autoCheck` true.
  - Called from setup.
- **Frontend listener** `useUpdateCheckListener()` in [src/lib/updater.ts](src/lib/updater.ts) subscribes to `updater://check-now`, runs silent `checkForUpdates()`, opens native ask-dialog via `promptAndInstall` if available. Honors `skippedVersion`.
- **Wired in both Settings and Editor pages.** Editor is the persistent surface after first capture; Settings catches manual visits. If both hidden, the tick still fires but listener instance is gone — acceptable since user will see prompt next time either window opens.

#### Phase 16b — remaining

1. ~~End-to-end release test.~~ **DONE 2026-05-23** — v0.1.1 tag-push triggered CI matrix; `latest.json` + dmgs landed on release. v0.1.2 re-released after macos-13 runner fix.
2. ~~CI: confirm Tauri Action publishes `latest.json`.~~ **DONE 2026-05-23** — confirmed live at `https://github.com/wadjakorn/capz/releases/latest/download/latest.json`.
3. **Key custody.** Confirm offline encrypted backup of `~/.tauri/capz-updater.key` stored separately from password. SPOF — see CLAUDE.md. *(user task — not code)*
4. **Auto-update smoke test deferred.** Oldest available build = v0.1.2. Re-run on next bump (v0.1.3) by keeping v0.1.2 dmg on hand to install → trigger update prompt → verify install + relaunch.

### Phase 15/16 — ship (2026-05-23)

- **v0.1.1 release.** First tag-push. CI matrix built mac-arm64, mac-x64, windows-x64. Updater artifacts + `latest.json` signed and uploaded. Mac-x64 matrix job stuck >12h waiting for `macos-13` runner (GitHub Intel runner deprecation/scarcity).
- **v0.1.2 release — macos-13 runner fix.** Switched x86_64-apple-darwin matrix entry from `os: macos-13` → `os: macos-latest` (arm64 host) + cross-compile via `--target x86_64-apple-darwin`. dtolnay/rust-toolchain installs target. Bundler cross-compiles within same OS family. Both mac jobs now share runner pool. File: [.github/workflows/build.yml](.github/workflows/build.yml).
- **Homebrew distribution.** Created tap `wadjakorn/homebrew-capz` with `Casks/capz.rb`. Install: `brew tap wadjakorn/capz && brew install --cask capz`. Cask handles Gatekeeper quarantine attribute removal automatically for ad-hoc signed app.
- **Auto-publish cask.** [.github/workflows/update-cask.yml](.github/workflows/update-cask.yml) fires on `release: published` (+ `workflow_dispatch`). Downloads both dmgs from release, computes SHA256, regex-patches `Casks/capz.rb` in tap repo via cross-repo PAT (`HOMEBREW_TAP_TOKEN`, fine-grained, Contents:write on tap only), commits + pushes. Initial v0.1.2 publish required manual `workflow_dispatch` since workflow file landed after release published; subsequent releases fire automatically.
- **Install verified.** `brew install --cask capz` works end-to-end on macOS arm64. Note: stale local tap clone shows placeholder SHAs → `brew update` (or untap+retap) pulls latest.

## Backlog — editor close/show UX (noted 2026-05-23)

User-noted enhancements deferred until after Phase 13:

1. **Editor hide/close shortcut.** `Esc` when nothing selected → hide editor (matches current persistent-workspace semantics from Phase 11). Currently `Esc` only deselects. Guard: skip when text-edit caret active or selection non-empty (Esc keeps deselect role first).
2. **Editor show/open shortcut.** Global hotkey to focus/show editor without going through tray. Likely default `CmdOrCtrl+Alt+Shift+0` or similar; user-configurable in Settings → Shortcuts. Wires into existing `windows::show_editor` path.
3. **Pre-close action.** Settings toggle: when editor closes/hides, optionally run Save / Copy / Save+Copy first (mirrors toolbar `output.defaultMode`). Lets keyboard-only workflow capture → annotate → `Esc` → done. Default off (preserves current behavior). New config field e.g. `general.closeAction: "none" | "save" | "copy" | "both"`.

Wire all three together: shortcut #1 fires → if `closeAction` set, run export pipeline → then hide. Shortcut #2 unmodified.

## Backlog — UI/UX polish (noted 2026-05-23)

User-noted enhancements deferred until Phase 14 (polish):

1. **Responsive editor chrome.** Some elements overflow editor window at small sizes — e.g. "Copied" / "Saved" toast/feedback badge, tool controllers with long inline labels or many controls (Tools tab Rect/Arrow/Text/Blur/Sticker rows in Settings). Fix: wrap controllers in horizontal-scroll container or stack vertically below breakpoint; truncate toast text; min-width clamps on toolbar groups.
2. ~~**Window-capture hotkey.** Settings → Shortcuts currently exposes only `captureFull` and `captureArea`. Wire `captureWindow` (already defined in `config.hotkeys` / `shortcuts.rs`) into the Shortcuts tab via a third `HotkeyRecorder` row. Default `CmdOrCtrl+Alt+Shift+5`.~~ Done 2026-05-23 — added `captureWindow` to `AppConfig.hotkeys` + `DEFAULT_CONFIG`, third `HotkeyRecorder` row in Settings → Shortcuts.
3. **Iconified buttons.** Replace bare-text buttons (toolbar tool buttons, Save/Copy/Cancel, Settings tab triggers, onboarding actions) with `lucide-react` icons + tooltip labels. Keep text on primary CTAs.
4. **Always-on-top toggle.** Settings → General switch. Per-window: editor (helpful while annotating over reference) — and possibly settings. Wire via `tauri::WebviewWindow::set_always_on_top(bool)` on toggle; persist in `general.alwaysOnTop`. Re-apply on window create.
5. **Context-aware cursors.** Tool-specific cursors in editor: `crosshair` while dragging shape (rect/arrow/blur region), `pointer` for select/pin, `text` for text tool, `move` while dragging existing element. Currently default arrow everywhere. Set via inline `style.cursor` on `EditorStage` container based on active tool + drag state.
6. **App + tray icon.** Replace Tauri default placeholder icons in [src-tauri/icons/](src-tauri/icons/) (32, 128, 128@2x, .icns, .ico) and tray icon. Generate dual-tone macOS template (black/transparent for menu bar auto-tint) + standard Windows multi-res .ico. Verify tray icon honors `set_icon_as_template(true)` on macOS so it inverts with menu bar theme.

## Open questions (PLAN.md §9) — RESOLVED 2026-05-22

- [x] **Output behavior:** default = **clipboard**. Settings mode = `file | clipboard | both` (replaces PLAN's `ask`).
- [x] **Branding:** app name = **`capz`** (rebrand from "Shotr"). Icon stays as-is for v1. Maker may re-brand later.
- [x] **Filename template:** keep structure, brand prefix → default `capz-{yyyy}{MM}{dd}-{HHmmss}`. User-overridable in Settings.
- [x] **Sticker library:** keep current 10 emoji; maker can edit `STICKERS` const in [src/stores/editor.ts](src/stores/editor.ts).
- [x] **Update channel:** stable only in v1.
- [x] **Telemetry:** none in v1.
