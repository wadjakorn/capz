# CP-0038 POC findings

> **POC v2 (cycle-and-commit) is what is on the branch now.** v1's hold gesture
> was abandoned after F1/F2/F6. Findings F1-F6 below were all measured against
> v1 and remain valid constraints on any design; v2 sidesteps F1 and F5 entirely
> by registering everything once at startup and never touching the plugin again.
>
> v2 bindings: `Cmd+Shift+A` cycle · `Cmd+Shift+Enter` commit ·
> `Cmd+Shift+Backspace` cancel · 6s idle auto-cancel (never fires a capture).

Throwaway spike. Record empirical results here as they land.

## F1 — CONFIRMED: registering a shortcut from inside a shortcut callback deadlocks the app

**Severity: blocks the CP-0038 mechanism as originally written.**

Observed on macOS 2026-07-18. Pressing the leader froze the entire machine
(spinning cursor, app unresponsive, force-quit required). Log ended at:

```
[ring-poc] LEADER PRESSED — showing ring WITHOUT focus, arming slot keys
command ring: cursor=(1210.58, 161.21) pos=(1030.58, 0) on monitor 1
```

`arm_slot_keys` never printed its first line, so the hang was inside
`global_shortcut().on_shortcut()`.

**Cause:** `tauri-plugin-global-shortcut` holds an internal lock while dispatching
a shortcut handler. Calling `on_shortcut()` (or `unregister()`) from *within* that
handler re-enters the same lock and deadlocks. Because the handler runs on the
main thread, the UI thread dies with it and the whole desktop appears to hang.

**Consequence for the real feature:** the transient arm/disarm that the entire
CP-0038 mechanism depends on **cannot be done synchronously inside the leader's
handler**. It must be hopped off the callback
(`tauri::async_runtime::spawn`) — which introduces a race the design must handle:

- Slot keys are armed *asynchronously* after the leader is already down. A very
  fast tap may land before its key is registered and simply be missed.
- Disarm is likewise async, so a slot key may stay live for a short window after
  the ring closes.
- Exit/teardown paths must NOT defer — a spawned task may never run before the
  process exits, leaking the bare keys system-wide. Those call sites must be
  synchronous, which is safe only because they are not inside a callback.

This is a genuine design constraint, not a POC artifact. It needs to be written
into CP-0038 before implementation, and the arm-race needs an answer.

## F2 — CONFIRMED: `Released` fires when the NON-MODIFIER key goes up

Observed macOS 2026-07-18. Two quick taps of Space while Cmd+Shift stayed held
logged `LEADER RELEASED after 92ms` and `after 57ms` — matching the Space taps,
not the modifier hold.

**Consequence:** the Cmd+Tab mechanic (hold modifier, tap to cycle, release
modifier to commit) is NOT reproducible. The gesture ends when Space lifts.

What IS buildable: the user holds all of Cmd+Shift+Space down, taps a slot key,
then releases. No auto-repeat was observed on a sustained hold, so holding is
stable. Ergonomically clumsier than Cmd+Tab — the leader's own key must stay
depressed throughout. **UX copy must not promise Cmd+Tab-equivalent behaviour.**

Also confirmed: the ring shows only while held and closes on release, which
follows directly from the above.

## F3 — CONFIRMED: unfocused ring keeps the other app live (Q3)
Cursor and tooltips in the previously focused app stayed active while the ring
was up. Showing the ring without `set_focus()` works.

Still unverified: whether the highlight event actually reaches and renders in
the unfocused webview (blocked by F6).

## F5 — CONFIRMED: arm/disarm race can leak keys permanently

**Severity: must be fixed in the real feature.**

On a short press the log shows the gesture COMPLETING before arming starts:

```
LEADER RELEASED after 57ms — highlighted=None
CANCELLED
armed slot key A ... disarmed slot key A
armed slot key S ... disarmed slot key S
```

Two independent `spawn`s (one arming, one disarming) race. Here arm won every
pair and it ended clean — by luck, not by design. **If disarm runs before arm,
the accelerator stays registered with no gesture to release it**, i.e. dead
system-wide until capz restarts.

Also visible: for short presses the slot accelerators are registered AFTER the
ring has already closed, so they are briefly live outside any gesture.

**Fix for the real feature:** serialize the lifecycle through a single owner —
a generation counter checked before each arm/disarm, or one task that owns
arm→wait→disarm — never two independent spawns.

## F6 — CONFIRMED: slot keys must carry the leader's modifiers

Observed macOS 2026-07-18: holding the leader and pressing A fired nothing.

**Cause:** while Cmd+Shift are held, pressing A emits `Cmd+Shift+A`. A bare `A`
shortcut requires NO modifiers, so it never matches during the hold. The POC
originally registered bare keys and could not possibly have worked.

**Consequence for the real feature:** a slot's selector is not a free-standing
key — it is `<leader modifiers> + <key>`. Two things follow:

1. The Settings UI cannot let the user pick an arbitrary bare key per slot; the
   modifiers are implied by the leader. If the leader changes, every slot
   accelerator changes with it.
2. Each slot accelerator (`Cmd+Shift+A`) is an ordinary registrable combo. So a
   user could bind those directly today with no ring at all — **the ring's only
   value is the visual feedback during the hold.** If that feedback proves
   unconvincing, the whole feature reduces to plain shortcuts and should be
   dropped.

## F4 — teardown leaves no keys registered (Q4)
Partially observed: disarm logged success for all four slots. Not yet stress-
tested against the F5 race or an exit mid-gesture.

## F7 — CONFIRMED: the ring window is reused, and the reused mode is sticky

Observed macOS 2026-07-18: "sometimes the ring is gone but the log still shows
output when I press the cycle key" — i.e. POC state said the ring was up while
no window was on screen.

**Cause:** `show_command_ring_ex` reuses an existing `command-ring` window
rather than rebuilding it. The two modes load DIFFERENT URLs (`ring/` vs
`ring/?poc=1`), and only the `?poc=1` build skips the focus-grab and blur-close.
The v1 ring hotkey is still registered, so if v1 opened the ring first, the POC
reused a v1-built webview — which still had its blur-close listener and, being
unfocused, closed itself immediately while the POC state stayed `Some`.

**Fix applied:** track the mode the live window was built in and rebuild on a
mismatch.

**Consequence for the real feature:** if v1 and v2 rings coexist (they are
planned to — separate config entries), they CANNOT share one reused window
unless the behavioural differences move out of the URL and into runtime state.
Either give v2 its own window label, or make the ring page mode-switchable at
runtime. Reuse-with-different-URL is a trap.

## F8 — `Delete` is the wrong accelerator on macOS
The key labelled "delete" on Mac keyboards is Backspace; Tauri's `Delete` is
forward-delete, which many Mac keyboards lack entirely. Cancel moved to
`Cmd+Shift+Backspace`. Worth remembering for any default binding.

## F9 — OPEN: the ring does not close when the user stops holding
Reported as surprising: "it's not gone when I unhold". This is inherent, not a
bug — F2 established that modifier release is unobservable, so there is nothing
to close on. v2 is explicitly not a hold gesture; the ring persists until
commit, cancel, or the idle timeout.

**This is a genuine UX mismatch to resolve before implementation.** The user's
instinct is that the ring belongs to the hold. If that instinct is strong, the
cycle-and-commit model may simply feel wrong regardless of how well it works.
