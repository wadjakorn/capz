# CP-0013 — Streamline scroll-capture manual/auto flow (no confirm step)

**Ticket:** CP-0013 (`vQYso7wmKCAo`) · **Branch:** `cp0013-scroll-flow` · **Date:** 2026-07-15

## Goal

Make the scrolling-capture flow direct, and give the manual and auto modes each a
clear, distinct interaction contract:

1. Drop the separate area-confirm step — the region is shown immediately and stays
   adjustable, with the capture controls present from the start.
2. Manual mode gates the backend sampler behind an explicit "Start manual capture".
3. Auto-scroll locks the UI: every other control is visibly disabled while it runs.

Windows auto-scroll speed/stitch correctness is **out of scope** — split to CP-0014.

## Architecture constraint (why two phases)

Region editing lives in the full-screen, per-monitor **overlay** window. Once
capture starts the overlay **must** be destroyed: it is a transparent full-screen
window that would otherwise intercept the mouse events the user needs to scroll the
target app. Therefore "region adjustable" and "in-flight capture" cannot be the same
window. The flow is two phases across two windows:

- **Phase 1 — Arm:** overlay window; region adjustable; compact **arming bar** with
  explicit Start-manual / Auto-scroll actions.
- **Phase 2 — Capture:** existing compact **HUD** window; takes over once an action
  is chosen; manual and auto contracts as below.

## Phase 1 — Arming bar (`src/app/overlay/page.tsx`)

`TemplateRect`'s action pill changes, **in scroll mode only**, from a keyboard hint
into two buttons (single-shot `area` mode keeps today's "↵ Capture · esc Cancel"):

- **Start manual capture** (primary): click **or Enter** → `confirmRegion(r)` →
  `scroll_capture_start_command` (unchanged: persists region, hides+destroys overlay,
  grabs frame 1, opens HUD, spawns sampler in **manual** mode).
- **Auto-scroll** (secondary): click → macOS Accessibility preflight (shared helper,
  see below) → `scroll_capture_start_command` with new `auto: true` param so the
  session begins in auto immediately (no manual→auto two-step, no first-tick race).
- **Esc** → cancel (closes overlay, as today).
- Region stays adjustable (drag / handles / arrow-nudge) until an action is clicked.
- **Double-click auto-confirm is removed** — it was the "confirm gesture" being
  dropped; the buttons are the only commit.

Keyboard summary in Phase 1: **Enter = Start manual capture**, **Esc = cancel**.
There is no keyboard shortcut to start auto directly (auto is a mouse-driven mode and
needs the Accessibility preflight anyway) — this is intended.

## Phase 2 — Manual capture (`src/app/scroll-hud/page.tsx`)

Today's manual HUD, unchanged behavior: **Cancel**, **Auto-scroll** (escalate to auto
mid-manual — kept), **Capture**. Enter = capture, Esc = cancel.

Cleanup only: the HUD's `startAuto` Accessibility preflight is extracted into a shared
helper so both the overlay's Auto-scroll button and the HUD's use one implementation.

## Phase 2 — Auto capture (`src/app/scroll-hud/page.tsx`)

Clean split (decided with user, reversing today's "Esc commits in auto"):

- **Enter / single-click anywhere on the pill** → stop & capture (`finish`).
- **Esc** → **cancel** (`cancel`) — dedicated discard path; the only way to bail
  during auto.
- **Cancel** and **Auto-scroll** buttons: rendered **visibly disabled** (grayed), not
  hidden (today they are hidden in auto). Clicks on a disabled button are swallowed so
  they do not bubble to the pill's capture handler (a disabled "Cancel" must never
  trigger a capture).
- Status line: `Auto-scrolling · Enter/click capture · Esc cancel`.

## Backend (`src-tauri/src/commands/scroll.rs`)

`scroll_capture_start_command` gains an optional `auto: bool` argument. When true, the
newly-created `ScrollSession` starts with `auto = true` and `auto_progressed = false`;
everything else identical. The running sampler then drives auto from its first tick.

## Files touched

- `src/app/overlay/page.tsx` — arming-bar buttons; Enter = start-manual; remove
  double-click confirm; Auto-scroll entry + preflight; pass `auto` to start command.
- `src/app/scroll-hud/page.tsx` — auto: Esc→cancel; disable (not hide) other buttons;
  swallow disabled-button clicks; status copy; extract shared preflight helper.
- `src-tauri/src/commands/scroll.rs` — optional `auto` param → seed `ScrollSession.auto`.

## Testing

- **Rust:** existing `scroll.rs` tests still pass; add coverage that `auto: true`
  seeds a session with `auto == true` (session-construction path).
- **Manual (Mac, via `mac-app-build`):**
  - Arm → adjust region → Start manual → scroll → Capture opens editor.
  - Arm → Auto-scroll → UI locked → Enter/click captures; Esc cancels (discards).
  - Disabled Cancel/Auto-scroll buttons do not trigger a capture when clicked.
  - Single-shot `area`/`full`/`window` capture unaffected.

## Out of scope

- Windows auto-scroll step sizing / stitch correctness → **CP-0014**.
- Any change to the stitcher, footer detection, or single-shot capture paths.
