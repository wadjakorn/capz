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
- [x] **macOS update invalidates Screen Recording grant — detection + UX (landed 2026-05-25)**. Confirmed root cause: [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) ships `"signingIdentity": "-"` (ad-hoc) so every build's cdhash changes; TCC keys the grant by code identity, so the System Settings row keeps the prior cdhash and the new binary reads denied. Real fix is Developer ID Application signing (paid Apple Developer account + notarization + secrets infra) — left as a follow-up below. This change ships the detection-and-prompt layer:
  - New [useStalePermissionAfterUpdateListener](src/lib/notice.ts) hook (macOS-only). On mount: reads `has_screen_recording_permission`, the current binary version via `@tauri-apps/api/app#getVersion`, and a `permissions.lastGrantedVersion` marker in [config.json](src/lib/config.ts) via `@tauri-apps/plugin-store`.
  - If granted now and the marker doesn't match the current version → writes current version as the marker. First install with no marker stays silent (onboarding owns the never-granted path).
  - If denied now and a marker exists for a *different* prior version → surfaces a 20s `toast.error` with stable id `permission-stale-after-update`, copy explaining macOS keeps the prior entry, and an "Open Privacy Settings" action wired to `open_system_settings_screen_recording`.
  - Wired in [src/app/editor/page.tsx](src/app/editor/page.tsx) next to the existing `usePermissionRevokedListener`. Verified clean — `pnpm tsc --noEmit`.
- [ ] **macOS Developer ID signing (upstream fix for stale TCC)** — switch [tauri.conf.json `bundle.macOS.signingIdentity`](src-tauri/tauri.conf.json) from `"-"` (ad-hoc) to a Developer ID Application certificate so the cdhash is stable across releases and the existing TCC grant survives updates. Needs paid Apple Developer Program account, cert + private key in keychain, notarization step in the release flow, and CI secret wiring (cert.p12 + password + ASC API key) — distinct from the Ed25519 updater key. Once landed, the detection-and-prompt above will mostly idle (still useful as a safety net for users on the last ad-hoc build).
- [ ] **Dark overlay baked into captured image** — selection overlay's dimmed backdrop still appears in exported PNG on some Windows machines on v0.1.9. Earlier fix in `025988a` (hide → poll `is_visible()` every 16ms / 400ms ceiling → 80ms settle → capture → close as post-step) reduced but did not eliminate it; repro is machine-dependent (slow GPU / refresh rate / WebView2 paint variance). Follow-up attempt (this change): on Windows, replace the 80ms post-poll settle with `DwmFlush()` — blocks until DWM finishes composing the next frame, deterministic and frame-rate-independent (no magic timeout). macOS keeps the 80ms fallback (rare repro). Added `windows-sys` Win32_Graphics_Dwm dep on the Windows target only. **Pending verification on the bad Windows machine.** If still repros: next step is option (E) capture-then-overlay model — grab full screen before showing overlay, render overlay over cached image, crop from buffer (eliminates compositor race entirely).
- [ ] **macOS "Capture Window" includes menu bar** — `xcap` window enumeration on macOS exposes the system menu bar as a capturable window. Filter it out (and likely Dock, Wallpaper, status items) in the window picker so users can't select non-app surfaces.
- [ ] **Windows "Capture Window" mode unusable — no window clickable** — on Windows the window-picker overlay shows the dim backdrop + hover hint but clicking any visible window does nothing; no highlight appears, no capture fires. Suspect causes: (a) `list_capture_windows` returning empty or filtering everything out on Windows (`current_monitor()` / `is_minimized()` / `pid` checks behave differently vs macOS, or `w.id()` errors on Win32 HWNDs), (b) coordinate-space mismatch — overlay hit-test uses logical CSS pixels while `WindowOverlayInfo` x/y/w/h are physical pixels on Windows (overlay also positioned in physical pixels per [windows.rs:84-88](src-tauri/src/windows.rs:84)) so rects land outside the React viewport, (c) z-order / focus issue where overlay never becomes `active` so click handler bails. First step: log `list_capture_windows` result length + first item coords on Windows; verify hit-test rect vs cursor coord space.

### New features

- [ ] **Copy/paste annotation elements** — duplicate any overlay element (arrow, text, sticker, blur rect, pin) via `⌘C` / `⌘V` on the editor stage. Preserve type + style; offset paste position so it's visible.
- [ ] **Ruler / guides** — toggleable horizontal + vertical rulers along the stage edges; pixel coords match exported image (account for `pixelRatio`).
- [ ] **Snapping / magnetic alignment** — element-to-element + element-to-edge snap lines while dragging/resizing (similar to Figma). Hold modifier (Alt?) to bypass.
- [ ] **Auto-shrink large captures** — cap exported image at a configurable max dimension (default e.g. 2560px long edge) to keep file sizes sane on 5K/6K displays. Setting lives in Output tab; "Original" option to disable.
- [ ] **Layout-independent global shortcuts** — bind hotkeys by physical key (USB HID / ANSI/ISO position) rather than the typed character, so `⌘⇧P` still fires when the active input source is Thai (where the same physical key produces `ญ`), Russian, Dvorak, etc. `tauri-plugin-global-shortcut` resolves accelerators by Unicode char on most paths, so a US-layout binding silently breaks when the user switches IME. Investigate: macOS `kVK_*` keycodes via `CGEventSourceKeyboardType` / `UCKeyTranslate` round-trip, Windows `MapVirtualKey(MAPVK_VSC_TO_VK)` with scancodes. Likely needs a custom shortcut layer below the plugin, or upstream patch. Settings UI should display the layout-localized label for the bound physical key.

### UX

- [x] **Merge onboarding into the editor window** (landed 2026-05-25) — mirror of the settings merge. No separate `onboarding` window remains.
  - Body extracted to [src/components/onboarding/OnboardingView.tsx](src/components/onboarding/OnboardingView.tsx) (`onDone` callback replaces window-close).
  - Editor page ([src/app/editor/page.tsx](src/app/editor/page.tsx)) gains `view: "onboarding"`, listens for `editor:show-onboarding`, renders `<SubViewHeader title="Welcome" onBack>` + `<OnboardingView onDone>`. Shared `SubViewHeader` replaces the prior settings-only header.
  - Rust [windows::show_onboarding](src-tauri/src/windows.rs) now `show_editor() + emit("editor:show-onboarding")`. First-launch path in [lib.rs](src-tauri/src/lib.rs) untouched (still calls `show_onboarding`); Settings → "Re-run onboarding" still invokes `show_onboarding_window` which routes through the same code path.
  - Deleted: `src/app/onboarding/` route + `src-tauri/capabilities/onboarding.json` (editor capabilities already cover required perms).
  - Verified clean — `cargo clippy --all-targets -- -D warnings` + `pnpm tsc --noEmit`.
- [ ] **High-quality capture feedback** — capturing 5K/6K screens can take seconds; show a loader / progress indicator in the tray or a transient HUD so the user knows it's working instead of suspecting a no-op.
- [x] **Revise macOS permission flow** (landed 2026-05-25)
  - Audit: app only needs Screen Recording (no Accessibility — `tauri-plugin-global-shortcut` uses Carbon `RegisterEventHotKey`, no AX trust required). Dropped the "Screen Recording vs Accessibility" ordering item.
  - [src/components/onboarding/OnboardingView.tsx](src/components/onboarding/OnboardingView.tsx) Permission step rewritten: derives a single `state` machine (`unknown | ask | open-settings | needs-relaunch | ready`) from `granted` + `requested` + `needsRelaunch`. One primary CTA per state instead of 4-button row. `StatusCard` + `Guidance` blocks give state-specific copy (first-prompt vs already-asked vs granted-mid-session).
  - **Auto-poll**: `useEffect` while on Permission step calls `has_screen_recording_permission` every 1500ms — UI flips to "ready" the instant the user toggles capz on in System Settings, no manual Re-check.
  - **Relaunch detection**: snapshots initial grant state in `initialGrantedRef`; if it transitions denied → granted within the same process, sets `needsRelaunch` and surfaces a warning-toned Guidance block + amber Relaunch CTA (macOS TCC only applies the new grant to processes started *after* the change).
  - **Mid-session revocation** (resurrects dropped [[14b residual]]): Rust [capture.rs `emit_capture_error`](src-tauri/src/commands/capture.rs) preflights `has_screen_recording()` on capture failure; if false, emits `app:permission-revoked` instead of the generic notice. Frontend [usePermissionRevokedListener](src/lib/notice.ts) shows a persistent toast with a "Re-run onboarding" action that emits `editor:show-onboarding`. Wired in [editor page](src/app/editor/page.tsx).
  - Helper: `commands::permissions::has_screen_recording()` extracted so capture.rs can call it without going through Tauri's command dispatch.
  - Verified clean — `cargo clippy --all-targets -- -D warnings` + `pnpm tsc --noEmit`.

### Known issues / follow-ups

- [ ] **Onboarding "Granted" sticks after mid-session revoke** — `CGPreflightScreenCaptureAccess()` caches the grant for the lifetime of the process, so toggling capz off in System Settings while the app is running still reports `true`. Polling preflight will never flip back to denied. Need an actual capture probe (e.g. `CGWindowListCreateImage` 1×1 or `CGDisplayStream`) and inspect for null/black pixels to detect revocation. The `app:permission-revoked` toast already fires when a real capture fails — this is only the onboarding StatusCard that lies.
- [x] **Automated version bump** (landed 2026-05-25) — [scripts/release.mjs](scripts/release.mjs) wired as `pnpm release patch|minor|major|<x.y.z> [--dry-run] [--no-commit] [--no-tag]`. Bumps `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` `[package].version` in place; refuses to commit if working tree has unrelated dirty files; creates `chore(release): vX.Y.Z` commit + matching `vX.Y.Z` tag. Does NOT push (user runs `git push && git push --tags` manually, matches existing release workflow). No CHANGELOG generation — repo doesn't keep one; commit history + tags are the log.

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
