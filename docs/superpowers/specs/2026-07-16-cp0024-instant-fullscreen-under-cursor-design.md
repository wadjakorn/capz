# CP-0024 — Instant full-screen-under-cursor capture (preserve transient app state)

**Date:** 2026-07-16
**Ticket:** CP-0024 (qZ5m24CguGE1)
**Status:** Design approved, ready for implementation plan

## Problem

When the user triggers a capture while interacting with another app, capz's
overlay steals OS focus from that app. macOS/Windows deactivate the previously
frontmost window on activation change, so transient UI collapses **before** the
pixels are grabbed:

- open dropdowns / menus / comboboxes close
- hover tooltips and hover states disappear
- focus rings / active fields go inactive

Two concrete user cases drive this:

1. **Hover tooltip** — source app focused, mouse parked over the target, tooltip
   showing.
2. **Right-click → context menu / properties** — source app focused, popup open.

In both, two things are fragile: the source app's **focus** (lose it → popup
closes) *and* the **mouse position** (move/click it → hover moves off, or the
click dismisses the menu). The current flow makes the user drive selection with
the **mouse**, and that act is exactly what destroys the state.

## Decision: reframe away from the ticket's non-activating-overlay plan

The original ticket proposed a large native change — a non-activating
`NSWindowStyleMaskNonactivatingPanel` overlay + `acceptsFirstMouse`, a temporary
global Esc shortcut, a passive `NSEvent` global mouse monitor to inject the
crosshair, and a Windows `WS_EX_NOACTIVATE` / `WM_MOUSEACTIVATE` counterpart —
so the user could still **mouse-drag** an area selection without stealing focus.

That plan is rejected as over-engineered for the real need. Two observations
collapse it:

1. **The mouse is already parked on the target.** So selection must be
   hands-off-the-mouse. Any mouse-driven picker is self-defeating for these
   cases.
2. **Tooltips / context menus are usually separate composited popup windows.** A
   *per-window* capture often misses them; a *screen/region framebuffer grab*
   reads whatever is literally on the glass, popup included. So "capture the
   screen" is the **most** reliable option here, and "capture this window" is the
   **least**.

Together these mean: **capture the monitor under the cursor, instantly, on
hotkey — no overlay, no picker, no focus steal — then crop in the editor.** This
needs zero native window hackery.

### Why multi-monitor stops being the hard part

Today's per-monitor overlay swarm + the 40 ms macOS focus-follow loop exist
**only because full-screen selection is mouse-driven** and the mouse could wander
onto any screen. Anchoring to "the monitor under the cursor" resolves the target
purely in Rust (cursor position + `list_monitors()`), so the picker and its
machinery are simply unnecessary for full-screen capture.

## Scope

**In scope (this change):**
- Full-screen capture always grabs the monitor under the cursor instantly, for
  any monitor count.
- Remove the multi-monitor full-screen **picker overlay** path.
- Trim the now-dead `full` branch from the frontend `PickMode`.

**Deferred (separate, later effort):**
- Area / window capture that preserves transient state via **keyboard-driven**
  target selection (arrow keys to choose window/region, Enter to commit, Esc to
  cancel). The user has a design in mind for this. Area/window overlays are
  **left exactly as they are today** in this change.

**Explicitly NOT touched:**
- `show_overlay_mode`, the macOS focus-follow loop, `set_focus`, all native
  panel/window style flags, Windows DWM transition handling — all still required
  by the untouched area/window/scroll overlays.
- No non-activating-panel work, no new global shortcuts, no new permissions.

## Design

### 1. Core behavior — `src-tauri/src/capture_dispatch.rs::dispatch_full`

Current: 1 monitor → instant grab via `capture_single_monitor`; N monitors →
`show_overlay_mode(app, "full")` picker.

New: **always** resolve the monitor under the cursor and grab it instantly via
the existing `capture_single_monitor` helper. The `show_overlay_mode(app,
"full")` call is removed. `capture_single_monitor` already hides the editor
first (so an in-editor capture doesn't bake the chrome in) and re-shows it on
failure — reused verbatim.

`capture_full_monitor` (pickers.rs) already reads the framebuffer **before** the
editor is shown/activated (`capture_to_editor` → `load_editor_image` →
`show_editor` → `macos_activate` all happen *after* the grab), so the moment of
capture is focus-clean. No change needed there.

### 2. New helper — `monitor_under_cursor()`

Factor out the cursor→monitor logic currently inlined in
`windows.rs::show_command_ring` so both callers share one implementation. It
lives in `services/monitor_service` (it is monitor logic, and keeps
`capture_dispatch` from depending on `windows.rs`). The macOS `cursor_cg_point()`
helper moves there too (or is re-exported); `show_command_ring` and
`dispatch_full` both call `monitor_service::monitor_under_cursor()`.

Cursor position source (same coordinate space xcap reports monitors in):
- **macOS:** `cursor_cg_point()` (already in windows.rs) — logical CG points.
- **Windows:** `GetCursorPos` (Win32, already-enabled `Win32_UI_WindowsAndMessaging`)
  — physical px, matching xcap's Windows monitor rects.
- **Other (Linux dev only):** `None`.

Selection is a **pure function** (mirrors the `ring_position` testability
pattern): given a cursor point (optional) and the monitor list, return the id of
the monitor whose rect contains the point; else the primary monitor; else the
first. A `None` cursor → primary/first. This guarantees full-screen capture
**always** grabs a monitor rather than falling back to a picker.

`show_command_ring` is refactored to call the shared helper (behavior-preserving).

### 3. Frontend cleanup — `src/app/overlay/page.tsx`

`PickMode`'s `mode === "full"` branch is now dead (full mode never opens an
overlay). Trim `PickMode` to window-only. `show_overlay_mode` and the rest of the
overlay page are unchanged (still serve area/window/scroll).

### 4. Tray

`tray.rs:89` also calls `dispatch_full`; it now grabs the cursor's monitor
instantly (cursor is wherever the tray menu was — a reasonable default).
Consistent, acceptable.

## Behavior change for existing users

On multi-monitor, the full-screen hotkey **no longer shows a pick-a-screen
overlay**. To capture a monitor other than the one under the cursor, the user
moves the cursor to that monitor first. This is faster for the common case and is
the intended trade-off.

## Testing

- **Unit:** the pure monitor-selection function — point inside a monitor returns
  that monitor; point outside all monitors falls back to primary; `None` cursor
  falls back to primary; empty-ish/edge fallbacks to first when no primary.
- **Manual — macOS, multi-monitor (verify on real hardware via `mac-app-build`):**
  1. On a secondary screen, open a custom dropdown (or hover to show a tooltip).
  2. Press the full-screen hotkey.
  3. Assert: the shot contains the popup; the *cursor's* monitor was captured;
     the dropdown never flickered closed.
- **Manual — single monitor:** unchanged path still captures instantly.
- **Manual — Windows:** cursor-monitor resolution picks the right screen;
  dropdown/tooltip survives.
- `cargo clippy --all-targets -- -D warnings` clean; `pnpm test:unit` green.

## Known limitation (unchanged from ticket, recorded not chased)

Native macOS `NSMenu` / Windows `TrackPopupMenu` run their own modal
event-tracking loop that owns the input stream while open — the global hotkey may
be swallowed while such a menu is up, and the menu may dismiss on capture. Custom
dropdowns, popovers, hover tooltips, focus rings, and separate property windows —
the common cases — are covered. Native OS menus are best-effort only.

## Future enhancements (not in this change)

- **"Freeze the active monitor"** option: on hotkey, snapshot **only the monitor
  under the cursor** (a single-display bitmap — cheap, unlike the whole-desktop
  freeze the ticket rejected on memory grounds), show it as a still, and let the
  user crop at leisure while the source keeps animating. Captures the exact
  instant without holding a multi-monitor bitmap.
- **Keyboard-driven area/window selection** for the state-preserving scenario
  (the deferred effort above).
