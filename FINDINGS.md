# CP-0038 POC findings

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

## F2 — `Released` semantics (Q1)
Not yet observed; the deadlock blocked the run.

## F3 — unfocused ring renders + keeps app focus (Q3)
The ring window was created before the hang. Rendering/focus behaviour not yet
observed.

## F4 — teardown leaves no bare keys registered (Q4)
Not yet observed. Note the keys were never successfully registered in the frozen
run, so nothing leaked.
