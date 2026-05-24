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

(empty — add as ideas land)
