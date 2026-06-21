# Windows Hotkey Assignment Robustness — Design

**Date:** 2026-06-21
**Status:** Approved design, pending implementation plan
**Scope:** Single implementation plan (one feature branch)

## Problem

Windows users report they cannot assign capture hotkeys. Two observed symptoms:
1. The chosen combo conflicts with a Windows/other-app shortcut and silently does nothing.
2. A hotkey ends up with "no modifier" and misbehaves.

Investigation shows capture itself works — **every failure mode is silent or misattributed**. The
defects span three layers (frontend recorder, config validation, Rust registration).

## Root-cause findings

References point at current code.

### Spine defects
1. **Validation accepts garbage** — `validateConfig` checks hotkey fields with `isStr` only
   (`src/lib/config.ts:411`). Any string persists: no-modifier, unparseable, or OS-reserved. A bad
   value survives every launch.
2. **Registration is atomic + order-dependent** — `register_shortcuts` (`src-tauri/src/shortcuts.rs:67`)
   runs `unregister_all`, then registers 4 shortcuts in sequence, early-returning `Err` on the first
   failure. Earlier shortcuts stay live; later ones are silently dropped. **One conflicting hotkey
   kills every hotkey after it in the list.**
3. **Failure surfacing is incomplete** — edit-time *does* toast + auto-revert
   (`src/components/settings/SettingsView.tsx:76`). Gaps:
   - **Startup is silent** (`src-tauri/src/lib.rs:173`): a bad persisted hotkey aborts registration
     of the rest, user not in Settings, no feedback. This is the primary "nothing works" path.
   - **Atomic-abort misattributes**: editing hotkey B while hotkey A (earlier in order) already
     conflicts → register fails at A before reaching B → toast blames + reverts B; problem stays.
   - **Raw error text**: toast shows `e.to_string()` / `{e:?}` — no "taken vs invalid vs reserved".

### Frontend recorder defects
4. **Zero Windows guardrails at record time** — `isReserved` hardcodes `if (!IS_MAC) return false`
   (`src/lib/shortcuts.ts:64`). No Windows reserved set, no live "is this taken" probe.
5. **Win (⊞) key unrepresentable** — `eventToAccelerator` maps `metaKey || ctrlKey → CmdOrCtrl`
   (`src/lib/shortcuts.ts:72`). On Windows `CmdOrCtrl` resolves to Ctrl, so pressing Win+Shift+S is
   silently recorded as Ctrl+Shift+S. Win+ combos are OS-reserved (apps cannot register them) AND the
   recorder rewrites them wrong.
6. **Space mis-tokenized** — branch order in `eventToAccelerator` (`src/lib/shortcuts.ts:92-98`):
   `key === " "` has `length === 1`, so it is caught by the `key.length === 1` branch and becomes a
   literal space token. The dedicated `key === " "` → `"Space"` branch below is **dead code**. Result
   accel `"CmdOrCtrl+Shift+ "` → Rust `parse_hotkey` trims the token to empty → `EmptyToken` error →
   registration fails (and under defect #2 can kill neighbors). **Ctrl+Shift+Space is currently
   unbindable.**

### Documented constraints (not bugs — must be communicated)
7. **Left/right modifier collapse** — `e.ctrlKey/shiftKey/altKey` are side-agnostic; side lives only
   in `e.code`/`e.location`, which the tokenizer ignores. Right-Ctrl records identically to Left-Ctrl.
   This is **correct and unavoidable**: Windows `RegisterHotKey` modifiers (`MOD_CONTROL` etc.) have
   no side concept. Cannot bind side-specific globally.
8. **No chords/sequences** — `tauri-plugin-global-shortcut` supports a single accelerator (one
   non-modifier key) per binding. `Alt+Shift+Q,W,E` is three separate bindings, never one sequence.

### Authoritative parser facts (`global-hotkey 0.7.0`, `src/hotkey.rs`)
Verified against the installed crate, not assumed:
- `parse_key` uppercases the token, so `"Space"`, `"Tab"`, `"Enter"`, `"ArrowLeft"`, `"ArrowUp"` etc.
  all parse (lines 286-300). Token names the recorder emits are correct **except** the literal-space
  bug (#6).
- **A bare key parses successfully** — `parse_hotkey` single-token branch (line 176) accepts `"3"` →
  `HotKey { mods: empty, key: Digit3 }`. It registers and hijacks the key globally. Therefore the
  **"≥1 modifier" rule is our policy, enforced in our code; the parser will not reject it.**
- Modifiers-only (`"CmdOrCtrl+Shift+Alt"`) → `InvalidFormat` (line 229, key is `None`). Parser rejects.
- Empty/trailing token (`"Ctrl+Shift+"`, literal-space) → `EmptyToken` (line 184). Parser rejects.
- `CmdOrCtrl` on non-macOS → `Modifiers::CONTROL`; `Super`/`Cmd`/`Command` → `Modifiers::SUPER`.

## Canonical accelerator rules (one definition, enforced everywhere)

A hotkey string is **valid** iff:
- It parses as a `Shortcut` (`global-hotkey` `parse_hotkey`), AND
- It has **≥1 modifier** from {Ctrl/CmdOrCtrl, Alt, Shift} (our policy — parser allows zero), AND
- It has **exactly 1 non-modifier key**, AND
- It is **not** in the platform reserved set, AND
- On Windows, **⊞ Win/Super is not a permitted modifier**.

This rule is implemented once on each side of the IPC boundary and kept consistent by the round-trip
test (below): every token the recorder can emit must `parse_hotkey` OK.

## Design — five layers over one spine

**Spine:** make registration non-atomic and return a structured per-hotkey status. Everything else
consumes that status.

### L1 — Recorder + frontend validation (`src/lib/shortcuts.ts`, `HotkeyRecorder.tsx`)
- **Fix Space tokenizer (#6):** tokenize via `e.code === "Space"` → `"Space"` *before* the
  `key.length === 1` branch. Audit other `e.code`-derived multi-char keys at the same time.
- **Platform-aware modifier mapping (#5):** split the `metaKey || ctrlKey` coercion. macOS:
  `metaKey → CmdOrCtrl`. Windows: `ctrlKey → CmdOrCtrl`, and `metaKey` (= Win) alone → **reject** with
  inline message "Windows reserves the ⊞ key — use Ctrl / Alt / Shift."
- **Reserved sets:** drop `if (!IS_MAC) return false`; add `RESERVED_WIN`. Keep `RESERVED_MAC`.
- **New shared `validateAccelerator(accel) → { ok: true } | { ok: false; reason: 'invalid' | 'reserved' | 'win' | 'no-modifier' }`** used by the recorder AND by config validation (L5).
- **Optional soft-warn (Finding D):** single-modifier + common-key combos (single letters, arrows,
  Space, Enter, Backspace) collide with everyday editing globally (e.g. `Ctrl+ArrowLeft` hijacks
  word-left in every text field). Show a yellow dismissible warning — **do not hard-block**; some
  users want them. This is advisory and may be deferred if it complicates L1.

### L2 — Record-time probe (new Rust command + recorder)
- **New command `probe_hotkey(accel: String) → HotkeyProbe { status }`**, `status ∈ ok | taken |
  invalid | reserved`. Steps: parse → if `Err` → `invalid`; reserved-set check → `reserved`;
  `on_shortcut(accel, noop)` then immediate `unregister(accel)` → `Err` ⇒ `taken`, else `ok`.
  Enforce the ≥1-modifier policy here too (`invalid` if zero).
- Runs while shortcuts are already suspended (recorder calls `suspend_shortcuts` on focus).
- **Recorder flow:** capture → local `validateAccelerator` → `invoke('probe_hotkey')` → accept and
  call `onChange` only on `ok`; otherwise show inline status. Feedback **before** save.
- **Edge — probe-ok then another app grabs before save:** the L3 registration report at save time is
  the backstop. Both probe and report are kept deliberately.
- **Edge — probe briefly grabs the combo globally:** acceptable; noop handler, instant unregister,
  shortcuts suspended, key still physically held.

### L3 — Non-atomic registration (`src-tauri/src/shortcuts.rs`) — the core fix
- Refactor `register_shortcuts` to register all four bindings **independently, never early-returning**.
- Returns `Vec<RegoResult { action: HotkeyAction, requested: String, effective: String, status }>`,
  `status ∈ Ok | Invalid | Taken | Reserved`.
- On `Invalid` (unparseable or violates ≥1-modifier policy): fall back to that action's DEFAULT, try
  registering the default, and report `requested` (the bad value) + `effective` (default). The app
  stays usable and one bad key cannot suppress the others.
- `reregister_shortcuts` returns the report to the frontend (was `Result<(), String>`).

### L4 — Surface failures everywhere (closes #3 gaps)
- **Edit-time** (`applyHotkey`): consume the per-action status of the *specific* edited action rather
  than a blind early-return — fixes misattribution. Map status → friendly copy:
  - `Taken` → "{accel} is already used by another app"
  - `Invalid` → "{accel} isn't a valid shortcut"
  - `Reserved` → "{accel} is reserved by the OS"
- **Startup** (`src-tauri/src/lib.rs:173`): capture the report. If any status ≠ `Ok`, emit
  `shortcuts://registration-report` and set a flag the tray/Settings reads → one-time notice "Some
  shortcuts are inactive — open Settings." The Settings → Shortcuts tab shows a per-row status badge
  (active / failed-reason) sourced from the report.

### L5 — Validation hardening (`src/lib/config.ts`)
- Replace `isStr` for the four hotkey fields with `isValidAccelerator` (uses L1's `validateAccelerator`
  rule). An invalid persisted value → drop that field to its DEFAULT and push an `issue`. The existing
  self-heal write path (`src/stores/settings.ts:69`) cleans disk so the warning does not recur.

## IPC types (ts-rs, per CLAUDE.md)

Defined in Rust, exported to `src/types/ipc.ts`:
- `HotkeyAction` enum: `CaptureFull | CaptureArea | CaptureWindow | ShowEditor`.
- `RegoStatus` enum: `Ok | Invalid | Taken | Reserved`.
- `RegoResult { action, requested, effective, status }`.
- `HotkeyProbe { status: 'ok' | 'taken' | 'invalid' | 'reserved' }`.

## Testing

**Rust**
- `register_shortcuts` with one `Invalid` hotkey → the other three report `Ok` (non-atomic proof).
- `register_shortcuts` with an `Invalid` hotkey → that action's `effective` = its default and registers.
- `probe_hotkey`: invalid / reserved / ok paths (taken requires a live conflict — cover via a
  pre-registered combo in the same process where feasible, else document as manual).
- Policy guard: bare `"3"` → `Invalid` despite parser accepting it.

**Frontend**
- `validateAccelerator`: no-modifier reject, Win-on-Windows reject, reserved reject, valid pass.
- `eventToAccelerator` Win-key path (Windows) → reject; macOS Cmd path → `CmdOrCtrl`.
- **Token round-trip matrix** — every key class the recorder can emit (letters, digits, F1–F24,
  Space, Tab, Enter, arrows) maps to a token that `parse_hotkey` accepts. Pins #6 and guards against
  future drift. The canonical example: `Ctrl+Shift+Space → "CmdOrCtrl+Shift+Space"` (not a literal
  space).

**Config**
- `validateConfig` with a no-modifier hotkey → field reset to default + `issue` recorded.

## Out of scope
- Side-specific (left/right) modifier binding — impossible via `RegisterHotKey` (Finding #7).
- Multi-key chords/sequences — unsupported by the plugin (Finding #8).
- Cross-platform reserved-list completeness beyond a pragmatic Windows/macOS starter set.

## Worked examples (verdicts under this design)

| User input | Recorded accel | Verdict |
|---|---|---|
| Ctrl+Shift+A | `CmdOrCtrl+Shift+A` | valid |
| Ctrl+Shift+Space | `CmdOrCtrl+Shift+Space` | valid (after #6 fix; was unbindable) |
| Ctrl+Shift+Tab | `CmdOrCtrl+Shift+Tab` | valid |
| Ctrl+Shift+Alt | `null` (modifiers only) | rejected at recorder; parser `InvalidFormat` if injected |
| Right-Ctrl+← | `CmdOrCtrl+ArrowLeft` | valid; records side-agnostic (#7); soft-warn candidate (D) |
| Right-Ctrl+Right-Shift+Enter | `CmdOrCtrl+Shift+Enter` | valid; side-agnostic |
| Left-Alt+Shift+Q/W/E | `Alt+Shift+Q` / `+W` / `+E` | three separate valid bindings (#8) |
| Left-Alt+Shift+C | `Alt+Shift+C` | valid |
| Win+Shift+S | rejected | Win disallowed on Windows (#5) |
| bare `3` (injected config) | `3` | parser accepts, our policy rejects → default fallback |
