# PROGRESS-COSMETIC — UX / visual polish tracker

Split from [PROGRESS-NEXT.md](PROGRESS-NEXT.md). Index: [BUG](PROGRESS-BUG.md) · [FEATURE](PROGRESS-FEATURE.md).

Scope: UI layout, visual hygiene, toasts/feedback, window-merge UX, tray menu. No behavior changes that belong in BUG; no new capabilities that belong in FEATURE.

Open items first (actionable for agents). Landed items below for context. Append, do not rewrite history.

## Open

- [ ] **Re-design saved/copied feedback** — both `toast.success("Copied")` (copy-to-clipboard, [src/app/editor/page.tsx](src/app/editor/page.tsx) + [src/components/editor/Toolbar.tsx](src/components/editor/Toolbar.tsx)) and `toast.success("Saved")` (export PNG) fire as small top-right toasts that are easy to miss and feel out of place for the primary success affordance of the app. Replace with a large transient overlay centered over the editor stage — semi-opaque card with a big check icon + "Copied to clipboard" / "Saved to <filename>" label that fades in and out over ~800ms, non-blocking. Keep small toasts for errors. Consider showing the saved path with a "Reveal in Finder/Explorer" action on the overlay.
- [ ] **High-quality capture feedback** — capturing 5K/6K screens can take seconds; show a loader / progress indicator in the tray or a transient HUD so the user knows it's working instead of suspecting a no-op.

## Landed

- [x] **Merge Settings into the editor window (landed 2026-05-24)** — single editor window now hosts a Settings view. Toolbar gear button or tray "Settings…" toggles `view: "editor" | "settings"` inside the editor page; no separate `settings` window remains.
  - Settings body extracted to [src/components/settings/SettingsView.tsx](src/components/settings/SettingsView.tsx) (no Toaster/notice/updater listeners — editor page owns those).
  - Editor page ([src/app/editor/page.tsx](src/app/editor/page.tsx)) renders `<Toolbar onOpenSettings>` or `<SettingsHeader onBack>` plus the view body; listens for `editor:show-settings` (payload = optional tab) and re-emits `settings:focus-tab` for SettingsView.
  - Rust [src-tauri/src/windows.rs](src-tauri/src/windows.rs) `show_settings()` now `show_editor() + emit("editor:show-settings", None)`. `show_editor()` no longer hides settings (window gone). `show_settings_command` ([src-tauri/src/commands/editor.rs](src-tauri/src/commands/editor.rs)) emits `editor:show-settings` with optional tab.
  - Capabilities ([default.json](src-tauri/capabilities/default.json), [desktop.json](src-tauri/capabilities/desktop.json)) swapped `"settings"` → `"editor"` so autostart/updater/global-shortcut/process perms attach to the editor window.
  - Old route `src/app/settings/` deleted; `Pick folder` toast actions emit `settings:focus-tab` locally instead of invoking the Rust command.
  - Verified clean — `pnpm tsc --noEmit` + `cargo clippy --all-targets -- -D warnings`.

- [x] **Merge onboarding into the editor window (landed 2026-05-25)** — mirror of the settings merge. No separate `onboarding` window remains.
  - Body extracted to [src/components/onboarding/OnboardingView.tsx](src/components/onboarding/OnboardingView.tsx) (`onDone` callback replaces window-close).
  - Editor page ([src/app/editor/page.tsx](src/app/editor/page.tsx)) gains `view: "onboarding"`, listens for `editor:show-onboarding`, renders `<SubViewHeader title="Welcome" onBack>` + `<OnboardingView onDone>`. Shared `SubViewHeader` replaces the prior settings-only header.
  - Rust [windows::show_onboarding](src-tauri/src/windows.rs) now `show_editor() + emit("editor:show-onboarding")`. First-launch path in [lib.rs](src-tauri/src/lib.rs) untouched (still calls `show_onboarding`); Settings → "Re-run onboarding" still invokes `show_onboarding_window` which routes through the same code path.
  - Deleted: `src/app/onboarding/` route + `src-tauri/capabilities/onboarding.json` (editor capabilities already cover required perms).
  - Verified clean — `cargo clippy --all-targets -- -D warnings` + `pnpm tsc --noEmit`.

- [x] **Simplify tray menu (landed 2026-05-25)** — dropped "Open Editor" + "Settings" entries; single "Open App" item now opens the merged editor window. Removed unused `windows::show_settings`. Capture shortcuts + Quit kept.

- [x] **Revise macOS permission flow (landed 2026-05-25)**
  - Audit: app only needs Screen Recording (no Accessibility — `tauri-plugin-global-shortcut` uses Carbon `RegisterEventHotKey`, no AX trust required). Dropped the "Screen Recording vs Accessibility" ordering item.
  - [src/components/onboarding/OnboardingView.tsx](src/components/onboarding/OnboardingView.tsx) Permission step rewritten: derives a single `state` machine (`unknown | ask | open-settings | needs-relaunch | ready`) from `granted` + `requested` + `needsRelaunch`. One primary CTA per state instead of 4-button row. `StatusCard` + `Guidance` blocks give state-specific copy (first-prompt vs already-asked vs granted-mid-session).
  - **Auto-poll**: `useEffect` while on Permission step calls `has_screen_recording_permission` every 1500ms — UI flips to "ready" the instant the user toggles capz on in System Settings, no manual Re-check.
  - **Relaunch detection**: snapshots initial grant state in `initialGrantedRef`; if it transitions denied → granted within the same process, sets `needsRelaunch` and surfaces a warning-toned Guidance block + amber Relaunch CTA (macOS TCC only applies the new grant to processes started *after* the change).
  - **Mid-session revocation** (resurrects dropped [[14b residual]]): Rust [capture.rs `emit_capture_error`](src-tauri/src/commands/capture.rs) preflights `has_screen_recording()` on capture failure; if false, emits `app:permission-revoked` instead of the generic notice. Frontend [usePermissionRevokedListener](src/lib/notice.ts) shows a persistent toast with a "Re-run onboarding" action that emits `editor:show-onboarding`. Wired in [editor page](src/app/editor/page.tsx).
  - Helper: `commands::permissions::has_screen_recording()` extracted so capture.rs can call it without going through Tauri's command dispatch.
  - Verified clean — `cargo clippy --all-targets -- -D warnings` + `pnpm tsc --noEmit`.

- [x] **Minimalize editor toolbar (landed 2026-05-27)** — Shottr-style zone layout (commit 0ad3cb4). [src/components/editor/Toolbar.tsx](src/components/editor/Toolbar.tsx) groups controls into output / capture / tools / zoom / settings zones with subtle separators, low-frequency actions collapse via `ToolButton` + `useOverflowSlots` + `OverflowMenu`, icon+tooltip replaces verbose labels. Tool-specific style controls now render contextually only when a tool with options is active. Keyboard shortcuts unchanged.

- [x] **One-shot tool flow + contextual overlay polish (landed 2026-05-27)** — supersedes original "auto-switch to Select" + "text commit on outside click" items. Place→adjust→deselect flow for arrow/rect/text/blur/sticker: placement keeps the new shape selected so contextual props are reachable; Esc or empty-canvas click then deselects AND flips tool back to Select (V). Pin stays continuous (no auto-flip). Empty-click with selection swallows the click so no extra shape is placed on deselect (closure-captured `tool` would otherwise fall through to placement branch). Text commits on outside click via existing textarea `onBlur` → `commitTextEditor` path (also covers click into another text). Toolbar row-2 (contextual tool options) now renders as a sticky absolute overlay anchored under row-1 with `backdrop-blur` instead of inserting a flow row that pushes the canvas down. Files: [src/stores/editor.ts](src/stores/editor.ts) `setTool` preserves selection only when switching TO `select`; [src/components/editor/EditorStage.tsx](src/components/editor/EditorStage.tsx) drops 5× immediate `setTool("select")` after `add(a)`, adds empty-click deselect-and-return guard in `handleMouseDown`; [src/hooks/useEditorShortcuts.ts](src/hooks/useEditorShortcuts.ts) Esc handler flips tool after `select(null)`; [src/components/editor/Toolbar.tsx](src/components/editor/Toolbar.tsx) row-2 absolute overlay. Pre-export hook untouched — must not mutate UI tool state. Verified `pnpm tsc --noEmit` clean.
