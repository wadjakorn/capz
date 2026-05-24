# PROGRESS-NEXT — post-v0.1.7 enhancements

Separate tracker from main [PROGRESS.md](PROGRESS.md) (phase 0–16 build log). This file covers residual deferred work + future enhancement passes. Append, do not rewrite history.

## Carried over from Phase 14

### 14c residual — "Pick folder" recovery action (landed 2026-05-24)

Goal: when export fails with `Permission denied` / `Read-only volume` / `Disk full`, surface a toast action that opens Settings → Output so the user can pick a writable folder without leaving the editor.

- [x] **Rust `show_settings_command`** ([src-tauri/src/commands/editor.rs](src-tauri/src/commands/editor.rs)) — wraps `windows::show_settings(app)` on main thread. Optional `tab: Option<String>` → emits `settings:focus-tab` event to settings window after show.
- [x] **Register in invoke handler** ([src-tauri/src/lib.rs](src-tauri/src/lib.rs)).
- [x] **Settings page → controlled `<Tabs>`** ([src/app/settings/page.tsx](src/app/settings/page.tsx)). `useState<TabValue>("shortcuts")` + listener for `settings:focus-tab` payload. `TAB_VALUES` whitelist guards setState.
- [x] **Toolbar export catch** ([src/components/editor/Toolbar.tsx](src/components/editor/Toolbar.tsx)). Recoverable titles (`Permission denied` / `Read-only volume` / `Disk full`) attach `action: { label: "Pick folder", onClick → invoke("show_settings_command", { tab: "output" }) }`.
- [x] **Copy-shortcut catch** ([src/app/editor/page.tsx](src/app/editor/page.tsx)) — mirrored same action.
- [x] **No new capability** — `invoke` already permitted in editor window default set.
- [x] **Verified clean** — `cargo check` + `pnpm tsc --noEmit` pass.

### 14b residual — capture-permission revoked mid-session (won't do, 2026-05-24)

Dropped. User decision: not worth implementing. Existing `notice::error` toast on capture failure is sufficient; user can re-grant via onboarding re-run or System Settings manually. Revisit only if real-world reports surface.

## Backlog (unscheduled)

### Bugs

- [ ] **Settings randomly fires "Saved" toast** — spurious toast not tied to a user save action. Investigate store-init / hydration paths in [src/app/settings/page.tsx](src/app/settings/page.tsx) and any `useEffect` that writes to `useSettings` on mount.
- [ ] **macOS "Capture Window" includes menu bar** — `xcap` window enumeration on macOS exposes the system menu bar as a capturable window. Filter it out (and likely Dock, Wallpaper, status items) in the window picker so users can't select non-app surfaces.

### New features

- [ ] **Copy/paste annotation elements** — duplicate any overlay element (arrow, text, sticker, blur rect, pin) via `⌘C` / `⌘V` on the editor stage. Preserve type + style; offset paste position so it's visible.
- [ ] **Ruler / guides** — toggleable horizontal + vertical rulers along the stage edges; pixel coords match exported image (account for `pixelRatio`).
- [ ] **Snapping / magnetic alignment** — element-to-element + element-to-edge snap lines while dragging/resizing (similar to Figma). Hold modifier (Alt?) to bypass.
- [ ] **Auto-shrink large captures** — cap exported image at a configurable max dimension (default e.g. 2560px long edge) to keep file sizes sane on 5K/6K displays. Setting lives in Output tab; "Original" option to disable.

### UX

- [ ] **High-quality capture feedback** — capturing 5K/6K screens can take seconds; show a loader / progress indicator in the tray or a transient HUD so the user knows it's working instead of suspecting a no-op.
- [ ] **Revise macOS permission flow** — current onboarding is functional but rough. Audit copy, ordering (Screen Recording vs Accessibility), retry affordances, and what happens when permission is revoked mid-session (see also dropped [[14b residual]]).
- [ ] **Automated version bump** — replace manual edits across `package.json` / `Cargo.toml` / `tauri.conf.json` / `PROGRESS.md` with a single script (`pnpm release patch|minor|major`) that bumps all three, updates changelog, tags, and pushes.

### Settings & tray menu revise

- [x] **Merge Settings into the editor window** (landed 2026-05-24) — single editor window now hosts a Settings view. Toolbar gear button or tray "Settings…" toggles `view: "editor" | "settings"` inside the editor page; no separate `settings` window remains.
  - Settings body extracted to [src/components/settings/SettingsView.tsx](src/components/settings/SettingsView.tsx) (no Toaster/notice/updater listeners — editor page owns those).
  - Editor page ([src/app/editor/page.tsx](src/app/editor/page.tsx)) renders `<Toolbar onOpenSettings>` or `<SettingsHeader onBack>` plus the view body; listens for `editor:show-settings` (payload = optional tab) and re-emits `settings:focus-tab` for SettingsView.
  - Rust [src-tauri/src/windows.rs](src-tauri/src/windows.rs) `show_settings()` now `show_editor() + emit("editor:show-settings", None)`. `show_editor()` no longer hides settings (window gone). `show_settings_command` ([src-tauri/src/commands/editor.rs](src-tauri/src/commands/editor.rs)) emits `editor:show-settings` with optional tab.
  - Capabilities ([default.json](src-tauri/capabilities/default.json), [desktop.json](src-tauri/capabilities/desktop.json)) swapped `"settings"` → `"editor"` so autostart/updater/global-shortcut/process perms attach to the editor window.
  - Old route `src/app/settings/` deleted; `Pick folder` toast actions emit `settings:focus-tab` locally instead of invoking the Rust command.
  - Verified clean — `pnpm tsc --noEmit` + `cargo clippy --all-targets -- -D warnings`.
- [x] **Simplify tray menu** (landed 2026-05-25) — dropped "Open Editor" + "Settings" entries; single "Open App" item now opens the merged editor window. Removed unused `windows::show_settings`. Capture shortcuts + Quit kept.
- [x] **Debounce settings save toast** (landed 2026-05-25) — wrapped the `configSig` effect in a 400ms trailing `setTimeout` with cleanup; toast call uses `id: "settings-saved"` so stacked fires coalesce to one. Per-keystroke edits now produce a single "Saved" toast once typing settles.
- [x] **Hotkey clash + register-failure handling** (landed 2026-05-25) — [SettingsView `applyHotkey`](src/components/settings/SettingsView.tsx) now snapshots prior hotkeys, blocks duplicate accelerators client-side with a labeled toast, and on Rust `reregister_shortcuts` failure (e.g. `RegisterEventHotKey failed for Digit2`) reverts the store and re-invokes reregister to restore prior OS bindings. Surfaces underlying error via stable-id toast instead of silent console.error.
- [x] **Disable global hotkey listener while editing a hotkey** (landed 2026-05-25) — added Rust `suspend_shortcuts` command ([src-tauri/src/shortcuts.rs](src-tauri/src/shortcuts.rs)) that calls `unregister_all`; registered in [src-tauri/src/lib.rs](src-tauri/src/lib.rs). [HotkeyRecorder](src/components/settings/HotkeyRecorder.tsx) invokes `suspend_shortcuts` on focus and `reregister_shortcuts` on blur (guarded by a `suspended` ref so back-to-back focus/blur don't double-fire).
