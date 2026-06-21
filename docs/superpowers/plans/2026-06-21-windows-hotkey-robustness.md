# Windows Hotkey Assignment Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make capture-hotkey assignment robust on Windows — one bad/conflicting hotkey can no longer silently break the others, and every failure is surfaced with an actionable reason.

**Architecture:** A pure Rust classifier (`accel.rs`) defines the canonical accelerator rules. Registration becomes non-atomic: each of the four hotkeys is classified, invalid/reserved ones fall back to their default, and all four are attempted independently, returning a per-hotkey status report. A `probe_hotkey` command gives the recorder live "is this taken?" feedback before save. The frontend recorder fixes the Space tokenizer, rejects the Win key, and validates before persisting; config validation drops garbage to defaults.

**Tech Stack:** Tauri v2 (`tauri-plugin-global-shortcut` 2.3.1 / `global-hotkey` 0.7.0), Rust, Next.js 15 + TypeScript, Zustand, Vitest, `cargo test`.

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-06-21-windows-hotkey-robustness-design.md`.
- **No ts-rs in this repo** — TS types mirroring Rust are hand-written (matches existing pattern). Keep Rust `#[serde(rename_all = ...)]` and the TS literal unions in sync by hand.
- Canonical accelerator validity: parses as `Shortcut` AND ≥1 modifier (Ctrl/CmdOrCtrl, Alt, Shift) AND exactly 1 non-modifier key AND not in the platform reserved set AND on Windows the Win/Super key is not a permitted modifier. **The parser accepts a bare key — the ≥1-modifier rule is OUR policy, enforced in our code.**
- Package manager is **pnpm 9** (never npm/yarn). Run `cargo clippy --all-targets -- -D warnings` clean.
- Every git commit ends with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (per environment rule). Commit subjects below omit it for brevity; add it on every commit.
- Conventional commits with `hotkeys` scope.

---

### Task 1: Rust accelerator classifier (`accel.rs`)

Pure, app-handle-free classification shared by registration and the probe. Fully unit-testable.

**Files:**
- Create: `src-tauri/src/accel.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod accel;` near the other `mod` declarations)

**Interfaces:**
- Produces: `pub enum AccelClass { Valid, Invalid, Reserved }`; `pub fn classify(accel: &str, is_windows: bool) -> AccelClass`.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/accel.rs`:

```rust
//! Pure accelerator classification shared by registration and the record-time
//! probe. No Tauri app handle required, so it is unit-testable in isolation.

use std::str::FromStr;
use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

/// Disposition of a requested accelerator string.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccelClass {
    /// Parses and satisfies our policy — safe to attempt to register.
    Valid,
    /// Unparseable, or violates the "≥1 modifier / single key / no Win" policy.
    Invalid,
    /// Parses but collides with an OS-reserved combo we refuse to bind.
    Reserved,
}

/// Windows combos we refuse even though `RegisterHotKey` might accept them —
/// binding them breaks core OS UX. Win+ combos are rejected separately (the
/// SUPER modifier is disallowed on Windows), so this is the non-Win set.
const RESERVED_WIN: &[&str] = &[
    "CmdOrCtrl+Shift+Escape", // Task Manager
    "Alt+Tab",
    "Alt+Shift+Tab",
    "Alt+Escape",
    "Alt+F4",
    "CmdOrCtrl+Escape",
];

/// macOS combos the OS owns and silently swallows.
const RESERVED_MAC: &[&str] = &[
    "CmdOrCtrl+Space",
    "CmdOrCtrl+Tab",
    "CmdOrCtrl+Q",
    "CmdOrCtrl+Shift+3",
    "CmdOrCtrl+Shift+4",
    "CmdOrCtrl+Shift+5",
];

/// Reserved check by parsed equality so it is independent of token spelling
/// (e.g. "Cmd+Space" vs "CmdOrCtrl+Space" parse equal on macOS).
fn is_reserved(sc: &Shortcut, is_windows: bool) -> bool {
    let list = if is_windows { RESERVED_WIN } else { RESERVED_MAC };
    list.iter()
        .filter_map(|r| Shortcut::from_str(r).ok())
        .any(|r| r == *sc)
}

pub fn classify(accel: &str, is_windows: bool) -> AccelClass {
    let Ok(sc) = Shortcut::from_str(accel) else {
        return AccelClass::Invalid;
    };
    // Policy the parser does NOT enforce:
    if sc.mods.is_empty() {
        return AccelClass::Invalid; // a bare key would hijack it globally
    }
    if is_windows && sc.mods.contains(Modifiers::SUPER) {
        return AccelClass::Invalid; // Win key is OS-reserved / unbindable
    }
    if is_reserved(&sc, is_windows) {
        return AccelClass::Reserved;
    }
    AccelClass::Valid
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_combo_with_modifiers() {
        assert_eq!(classify("CmdOrCtrl+Shift+A", false), AccelClass::Valid);
        assert_eq!(classify("CmdOrCtrl+Shift+A", true), AccelClass::Valid);
    }

    #[test]
    fn space_is_valid_when_named() {
        assert_eq!(classify("CmdOrCtrl+Shift+Space", true), AccelClass::Valid);
    }

    #[test]
    fn bare_key_rejected_by_policy_though_parser_accepts() {
        // "3" parses fine (single-key branch) but has no modifier.
        assert_eq!(classify("3", true), AccelClass::Invalid);
    }

    #[test]
    fn modifiers_only_rejected() {
        assert_eq!(classify("CmdOrCtrl+Shift+Alt", true), AccelClass::Invalid);
    }

    #[test]
    fn empty_token_rejected() {
        assert_eq!(classify("CmdOrCtrl+Shift+", true), AccelClass::Invalid);
    }

    #[test]
    fn win_key_rejected_on_windows() {
        assert_eq!(classify("Super+Shift+S", true), AccelClass::Invalid);
    }

    #[test]
    fn reserved_mac_and_win() {
        assert_eq!(classify("CmdOrCtrl+Space", false), AccelClass::Reserved);
        assert_eq!(classify("Alt+Tab", true), AccelClass::Reserved);
    }
}
```

Add to `src-tauri/src/lib.rs` (with the other module declarations near the top):

```rust
mod accel;
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test accel::tests`
Expected: compile succeeds, tests fail or — if `classify` not yet wired into the module tree — a build error pointing at `mod accel;`. (If the file content above is committed whole, the tests should PASS; in that case treat Step 3 as a no-op and confirm.)

- [ ] **Step 3: Confirm implementation present**

The implementation is included with the tests above. No further code needed for this task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test accel::tests`
Expected: PASS (7 tests). Then `cargo clippy --all-targets -- -D warnings` clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/accel.rs src-tauri/src/lib.rs
git commit -m "feat(hotkeys): pure accelerator classifier with policy + reserved sets"
```

---

### Task 2: Non-atomic registration + status report (`shortcuts.rs`, `lib.rs`)

Replace the all-or-nothing `register_shortcuts` with independent per-hotkey registration returning a structured report; surface launch-time failures via `notice`.

**Files:**
- Modify: `src-tauri/src/shortcuts.rs` (replace `register_shortcuts`, `reregister_shortcuts`; add types, `plan_one`, `register_one`, `dispatch_action`)
- Modify: `src-tauri/src/lib.rs:173-179` (consume the report; notice on any non-`Ok`)

**Interfaces:**
- Consumes: `accel::classify`, `accel::AccelClass` (Task 1).
- Produces: `pub enum RegoStatus { Ok, Invalid, Taken, Reserved }`; `pub enum HotkeyAction { CaptureFull, CaptureArea, CaptureWindow, ShowEditor }`; `pub struct RegoResult { action, requested, effective, status }`; `pub fn register_shortcuts(&AppHandle) -> Vec<RegoResult>`; `pub fn plan_one(HotkeyAction, &str, bool) -> (String, RegoStatus)`; `reregister_shortcuts` command now returns `Vec<RegoResult>`.

- [ ] **Step 1: Write the failing test for `plan_one`**

Add to the bottom of `src-tauri/src/shortcuts.rs` inside a `#[cfg(test)]` module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_request_keeps_itself_and_ok() {
        let (eff, st) = plan_one(HotkeyAction::CaptureFull, "CmdOrCtrl+Alt+Shift+A", true);
        assert_eq!(eff, "CmdOrCtrl+Alt+Shift+A");
        assert_eq!(st, RegoStatus::Ok);
    }

    #[test]
    fn invalid_request_falls_back_to_default() {
        let (eff, st) = plan_one(HotkeyAction::CaptureArea, "3", true); // no modifier
        assert_eq!(eff, DEFAULT_AREA);
        assert_eq!(st, RegoStatus::Invalid);
    }

    #[test]
    fn reserved_request_falls_back_to_default() {
        let (eff, st) = plan_one(HotkeyAction::CaptureWindow, "Alt+Tab", true);
        assert_eq!(eff, DEFAULT_WINDOW);
        assert_eq!(st, RegoStatus::Reserved);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test shortcuts::tests`
Expected: FAIL — `plan_one`, `HotkeyAction`, `RegoStatus` not defined.

- [ ] **Step 3: Implement the types, planning, and non-atomic registration**

In `src-tauri/src/shortcuts.rs`, add imports and types near the top (after existing `use` lines):

```rust
use crate::accel::{classify, AccelClass};

#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum RegoStatus {
    Ok,
    Invalid,
    Taken,
    Reserved,
}

#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum HotkeyAction {
    CaptureFull,
    CaptureArea,
    CaptureWindow,
    ShowEditor,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RegoResult {
    pub action: HotkeyAction,
    pub requested: String,
    pub effective: String,
    pub status: RegoStatus,
}

fn default_accel(action: HotkeyAction) -> &'static str {
    match action {
        HotkeyAction::CaptureFull => DEFAULT_FULL,
        HotkeyAction::CaptureArea => DEFAULT_AREA,
        HotkeyAction::CaptureWindow => DEFAULT_WINDOW,
        HotkeyAction::ShowEditor => DEFAULT_SHOW_EDITOR,
    }
}

/// Decide what to attempt registering for one action before any live call.
/// Invalid/Reserved requests fall back to the action's default so the app
/// stays usable; the returned status describes the REQUESTED value.
pub fn plan_one(action: HotkeyAction, requested: &str, is_windows: bool) -> (String, RegoStatus) {
    match classify(requested, is_windows) {
        AccelClass::Valid => (requested.to_string(), RegoStatus::Ok),
        AccelClass::Invalid => (default_accel(action).to_string(), RegoStatus::Invalid),
        AccelClass::Reserved => (default_accel(action).to_string(), RegoStatus::Reserved),
    }
}
```

Replace the whole existing `register_shortcuts` function (and its helpers) with:

```rust
fn dispatch_action<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction) {
    match action {
        HotkeyAction::CaptureFull => emit_trigger(app, CaptureKind::Full),
        HotkeyAction::CaptureArea => emit_trigger(app, CaptureKind::Area),
        HotkeyAction::CaptureWindow => emit_trigger(app, CaptureKind::Window),
        HotkeyAction::ShowEditor => {
            log::info!("shortcut triggered: show_editor");
            if let Err(e) = windows::show_editor(app) {
                log::error!("show_editor failed: {e}");
            }
        }
    }
}

fn register_one<R: Runtime>(
    app: &AppHandle<R>,
    action: HotkeyAction,
    accel: &str,
) -> Result<(), String> {
    let sc: Shortcut = accel.parse().map_err(|e| format!("{e:?}"))?;
    let app2 = app.clone();
    app.global_shortcut()
        .on_shortcut(sc, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                dispatch_action(&app2, action);
            }
        })
        .map_err(|e| e.to_string())
}

/// Register all four hotkeys independently. One failure never aborts the rest.
/// Returns a per-action report; the status describes the requested value.
pub fn register_shortcuts<R: Runtime>(app: &AppHandle<R>) -> Vec<RegoResult> {
    let (full, area, window, show_editor) = read_hotkeys(app);
    let _ = app.global_shortcut().unregister_all();
    let win = cfg!(target_os = "windows");

    let items = [
        (HotkeyAction::CaptureFull, full),
        (HotkeyAction::CaptureArea, area),
        (HotkeyAction::CaptureWindow, window),
        (HotkeyAction::ShowEditor, show_editor),
    ];

    let mut report = Vec::with_capacity(items.len());
    for (action, requested) in items {
        let (effective, pre) = plan_one(action, &requested, win);
        let status = match register_one(app, action, &effective) {
            Ok(()) => pre,
            Err(e) => {
                log::error!("register {action:?} '{effective}' failed: {e}");
                // A live failure on a Valid request means the OS rejected it.
                if pre == RegoStatus::Ok {
                    RegoStatus::Taken
                } else {
                    pre
                }
            }
        };
        report.push(RegoResult {
            action,
            requested,
            effective,
            status,
        });
    }
    report
}
```

Replace the `reregister_shortcuts` command:

```rust
#[tauri::command]
pub fn reregister_shortcuts<R: Runtime>(app: AppHandle<R>) -> Vec<RegoResult> {
    register_shortcuts(&app)
}
```

Update `src-tauri/src/lib.rs:173-179`, replacing the `if let Err(e) = shortcuts::register_shortcuts(...)` block with:

```rust
let report = shortcuts::register_shortcuts(app.handle());
let inactive: Vec<String> = report
    .iter()
    .filter(|r| r.status != shortcuts::RegoStatus::Ok)
    .map(|r| r.requested.clone())
    .collect();
if !inactive.is_empty() {
    log::error!("hotkeys inactive at launch: {inactive:?}");
    notice::error(
        app.handle(),
        format!(
            "Some shortcuts are inactive ({}). Open Settings to fix them.",
            inactive.join(", ")
        ),
    );
}
let _ = app.emit("shortcuts://registration-report", &report);
```

(`app.emit` requires `use tauri::Emitter;` — already imported in `lib.rs`; add it if not.)

- [ ] **Step 4: Run tests + build to verify they pass**

Run: `cd src-tauri && cargo test shortcuts::tests && cargo build`
Expected: 3 tests PASS; build succeeds. Then `cargo clippy --all-targets -- -D warnings` clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/shortcuts.rs src-tauri/src/lib.rs
git commit -m "feat(hotkeys): non-atomic per-hotkey registration with status report"
```

---

### Task 3: `probe_hotkey` command

Live "is this combo registrable / taken" check for the recorder.

**Files:**
- Modify: `src-tauri/src/shortcuts.rs` (add `HotkeyProbe`, `probe_hotkey`)
- Modify: `src-tauri/src/lib.rs:119-121` (register `shortcuts::probe_hotkey` in `generate_handler!`)

**Interfaces:**
- Consumes: `accel::classify`, `RegoStatus` (Tasks 1–2).
- Produces: `pub struct HotkeyProbe { status: RegoStatus }`; command `probe_hotkey(accel: String) -> HotkeyProbe`.

- [ ] **Step 1: Add the type and command**

In `src-tauri/src/shortcuts.rs`:

```rust
#[derive(Clone, Copy, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyProbe {
    pub status: RegoStatus,
}

/// Record-time probe: classify, then (if valid) attempt a throwaway register to
/// detect a live conflict. Must be called while shortcuts are suspended (the
/// recorder suspends on focus) so our own bindings don't read as taken.
#[tauri::command]
pub fn probe_hotkey<R: Runtime>(app: AppHandle<R>, accel: String) -> HotkeyProbe {
    let win = cfg!(target_os = "windows");
    let status = match classify(&accel, win) {
        AccelClass::Invalid => RegoStatus::Invalid,
        AccelClass::Reserved => RegoStatus::Reserved,
        AccelClass::Valid => match accel.parse::<Shortcut>() {
            Ok(sc) => {
                let gs = app.global_shortcut();
                match gs.register(sc) {
                    Ok(()) => {
                        let _ = gs.unregister(sc);
                        RegoStatus::Ok
                    }
                    Err(_) => RegoStatus::Taken,
                }
            }
            Err(_) => RegoStatus::Invalid,
        },
    };
    HotkeyProbe { status }
}
```

Register it in `src-tauri/src/lib.rs` `generate_handler!` (next to the other `shortcuts::` entries):

```rust
            shortcuts::reregister_shortcuts,
            shortcuts::suspend_shortcuts,
            shortcuts::probe_hotkey,
```

- [ ] **Step 2: Build to verify it compiles**

Run: `cd src-tauri && cargo build`
Expected: success. If `register`/`unregister` method names differ, the error names the correct method on `GlobalShortcut` — adjust accordingly.

- [ ] **Step 3: Manual smoke (documented, not automated)**

`Taken`/live paths need a running app + real OS. Defer to the end-to-end check in Task 7. No unit test here.

- [ ] **Step 4: Clippy**

Run: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/shortcuts.rs src-tauri/src/lib.rs
git commit -m "feat(hotkeys): probe_hotkey command for record-time conflict feedback"
```

---

### Task 4: Frontend accelerator logic (`src/lib/shortcuts.ts`)

Fix the Space tokenizer, reject the Win key at capture, add platform-parameterized `validateAccelerator`, a Windows reserved set, IPC types, and a status→message helper. All pure and unit-testable.

**Files:**
- Modify: `src/lib/shortcuts.ts`
- Test: `src/lib/shortcuts.test.ts` (create)

**Interfaces:**
- Produces: `type Platform = "mac" | "win"`; `eventToAccelerator(e, platform?) -> { ok: true; accel: string } | { ok: false; reason: "none" | "win" } | null`; `validateAccelerator(accel, platform?) -> { ok: true } | { ok: false; reason: "invalid" | "reserved" | "win" | "no-modifier" }`; `isReserved(accel, platform?) -> boolean`; `formatShortcut(accel, platform?) -> string`; `statusMessage(accel, status) -> string | null`; types `RegoStatus`, `HotkeyAction`, `RegoResult`, `HotkeyProbe`.
- Consumed by: Task 5 (config), Task 6 (recorder), Task 7 (settings).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/shortcuts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  eventToAccelerator,
  validateAccelerator,
  isReserved,
  statusMessage,
} from "./shortcuts";

function evt(init: Partial<KeyboardEvent>): KeyboardEvent {
  return { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, key: "", code: "", ...init } as KeyboardEvent;
}

describe("eventToAccelerator", () => {
  it("tokenizes Space as 'Space', not a literal space", () => {
    const r = eventToAccelerator(evt({ ctrlKey: true, shiftKey: true, key: " ", code: "Space" }), "win");
    expect(r).toEqual({ ok: true, accel: "CmdOrCtrl+Shift+Space" });
  });

  it("rejects the Win key on Windows", () => {
    const r = eventToAccelerator(evt({ metaKey: true, shiftKey: true, key: "S", code: "KeyS" }), "win");
    expect(r).toEqual({ ok: false, reason: "win" });
  });

  it("maps Cmd to CmdOrCtrl on macOS", () => {
    const r = eventToAccelerator(evt({ metaKey: true, shiftKey: true, key: "A", code: "KeyA" }), "mac");
    expect(r).toEqual({ ok: true, accel: "CmdOrCtrl+Shift+A" });
  });

  it("returns the no-modifier signal when only a key is pressed", () => {
    const r = eventToAccelerator(evt({ key: "A", code: "KeyA" }), "win");
    expect(r).toEqual({ ok: false, reason: "none" });
  });

  it("ignores modifier-only presses", () => {
    expect(eventToAccelerator(evt({ ctrlKey: true, key: "Control", code: "ControlLeft" }), "win")).toBeNull();
  });
});

describe("validateAccelerator", () => {
  it("accepts a normal combo", () => {
    expect(validateAccelerator("CmdOrCtrl+Shift+A", "win")).toEqual({ ok: true });
  });
  it("rejects a bare key", () => {
    expect(validateAccelerator("A", "win")).toEqual({ ok: false, reason: "no-modifier" });
  });
  it("rejects an empty/trailing token", () => {
    expect(validateAccelerator("CmdOrCtrl+Shift+", "win")).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects the Win key on Windows", () => {
    expect(validateAccelerator("Super+Shift+S", "win")).toEqual({ ok: false, reason: "win" });
  });
  it("rejects a reserved combo", () => {
    expect(validateAccelerator("Alt+Tab", "win")).toEqual({ ok: false, reason: "reserved" });
  });
});

describe("statusMessage", () => {
  it("returns null for ok and copy for failures", () => {
    expect(statusMessage("X", "ok")).toBeNull();
    expect(statusMessage("Ctrl+Shift+A", "taken")).toMatch(/another app/);
    expect(statusMessage("Ctrl+Shift+A", "reserved")).toMatch(/reserved/);
    expect(statusMessage("Ctrl+Shift+A", "invalid")).toMatch(/valid/);
  });
});

describe("isReserved", () => {
  it("uses the Windows set on win", () => {
    expect(isReserved("Alt+Tab", "win")).toBe(true);
    expect(isReserved("CmdOrCtrl+Space", "win")).toBe(false);
  });
  it("uses the macOS set on mac", () => {
    expect(isReserved("CmdOrCtrl+Space", "mac")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/shortcuts.test.ts`
Expected: FAIL — new signatures/exports not present.

- [ ] **Step 3: Rewrite `src/lib/shortcuts.ts`**

Replace the file with (keeps the existing display maps; refactors functions to take a `platform` argument and adds the new exports):

```ts
export type Platform = "mac" | "win";

function currentPlatform(): Platform {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "mac"
    : "win";
}

// ---- IPC types (hand-mirrored from Rust; keep in sync with shortcuts.rs) ----
export type RegoStatus = "ok" | "invalid" | "taken" | "reserved";
export type HotkeyAction = "captureFull" | "captureArea" | "captureWindow" | "showEditor";
export type RegoResult = {
  action: HotkeyAction;
  requested: string;
  effective: string;
  status: RegoStatus;
};
export type HotkeyProbe = { status: RegoStatus };

const KEY_DISPLAY_MAC: Record<string, string> = {
  CmdOrCtrl: "⌘", Cmd: "⌘", Meta: "⌘", Super: "⌘", Ctrl: "⌃", Control: "⌃",
  Alt: "⌥", Option: "⌥", Shift: "⇧", Enter: "↩", Return: "↩", Escape: "⎋",
  Esc: "⎋", Backspace: "⌫", Delete: "⌦", Tab: "⇥", Space: "␣",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
};

const KEY_DISPLAY_WIN: Record<string, string> = {
  CmdOrCtrl: "Ctrl", Cmd: "Win", Meta: "Win", Super: "Win", Control: "Ctrl", Option: "Alt",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
};

const MODIFIERS = new Set([
  "CmdOrCtrl", "Cmd", "Ctrl", "Control", "Meta", "Super", "Alt", "Option", "Shift",
]);

const RESERVED_MAC = new Set([
  "Cmd+Space", "Cmd+Tab", "Cmd+Q", "Cmd+Shift+3", "Cmd+Shift+4", "Cmd+Shift+5",
]);

const RESERVED_WIN = new Set([
  "CmdOrCtrl+Shift+Escape", "Alt+Tab", "Alt+Shift+Tab", "Alt+Escape", "Alt+F4", "CmdOrCtrl+Escape",
]);

export function formatShortcut(accel: string, platform: Platform = currentPlatform()): string {
  if (!accel) return "";
  const map = platform === "mac" ? KEY_DISPLAY_MAC : KEY_DISPLAY_WIN;
  const parts = accel.split("+").map((p) => map[p] ?? p);
  return platform === "mac" ? parts.join("") : parts.join("+");
}

export function isReserved(accel: string, platform: Platform = currentPlatform()): boolean {
  if (platform === "mac") {
    return RESERVED_MAC.has(accel.replace(/CmdOrCtrl/g, "Cmd"));
  }
  return RESERVED_WIN.has(accel);
}

export type AccelEvent =
  | { ok: true; accel: string }
  | { ok: false; reason: "none" | "win" };

function tokenFromEvent(e: KeyboardEvent): string {
  const code = e.code;
  let m: RegExpMatchArray | null;
  if ((m = code.match(/^Digit([0-9])$/)) || (m = code.match(/^Numpad([0-9])$/))) return m[1];
  if ((m = code.match(/^Key([A-Z])$/))) return m[1];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (code === "Space") return "Space"; // before the length===1 catch (Space fix)
  const key = e.key;
  if (key.length === 1) return key.toUpperCase();
  if (key.startsWith("Arrow")) return key;
  return key;
}

export function eventToAccelerator(
  e: KeyboardEvent,
  platform: Platform = currentPlatform(),
): AccelEvent | null {
  const key = e.key;
  if (!key || MODIFIERS.has(key) || key === "Meta" || key === "Control") return null;

  const parts: string[] = [];
  if (platform === "mac") {
    if (e.metaKey) parts.push("CmdOrCtrl");
    else if (e.ctrlKey) parts.push("Ctrl");
  } else {
    if (e.metaKey) return { ok: false, reason: "win" }; // ⊞ Win disallowed on Windows
    if (e.ctrlKey) parts.push("CmdOrCtrl");
  }
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  if (parts.length === 0) return { ok: false, reason: "none" };
  return { ok: true, accel: [...parts, tokenFromEvent(e)].join("+") };
}

export type AccelValidation =
  | { ok: true }
  | { ok: false; reason: "invalid" | "reserved" | "win" | "no-modifier" };

export function validateAccelerator(
  accel: string,
  platform: Platform = currentPlatform(),
): AccelValidation {
  if (!accel) return { ok: false, reason: "invalid" };
  const parts = accel.split("+");
  if (parts.some((p) => p.trim() === "")) return { ok: false, reason: "invalid" };
  const keys = parts.filter((p) => !MODIFIERS.has(p));
  const mods = parts.filter((p) => MODIFIERS.has(p));
  if (keys.length !== 1) return { ok: false, reason: "invalid" };
  if (platform === "win" && parts.some((p) => p === "Cmd" || p === "Meta" || p === "Super")) {
    return { ok: false, reason: "win" };
  }
  if (mods.length === 0) return { ok: false, reason: "no-modifier" };
  if (isReserved(accel, platform)) return { ok: false, reason: "reserved" };
  return { ok: true };
}

export function statusMessage(accel: string, status: RegoStatus): string | null {
  switch (status) {
    case "ok":
      return null;
    case "taken":
      return `${accel} is already used by another app`;
    case "reserved":
      return `${accel} is reserved by the OS`;
    case "invalid":
      return `${accel} isn't a valid shortcut`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/shortcuts.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shortcuts.ts src/lib/shortcuts.test.ts
git commit -m "fix(hotkeys): Space tokenizer, Win-key rejection, validateAccelerator + probe types"
```

---

### Task 5: Config validation hardening (`src/lib/config.ts`)

Reject persisted hotkeys that violate the canonical rules; drop them to defaults with an `issue` so the existing self-heal cleans disk.

**Files:**
- Modify: `src/lib/config.ts` (add `isValidAccelerator`; use it in the `hotkeys` `vsec` specs)
- Test: `src/lib/config.test.ts` (create)

**Interfaces:**
- Consumes: `validateAccelerator` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `src/lib/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateConfig, DEFAULT_CONFIG } from "./config";

describe("validateConfig hotkeys", () => {
  it("keeps a valid hotkey", () => {
    const { config, issues } = validateConfig({
      schemaVersion: 1,
      hotkeys: { ...DEFAULT_CONFIG.hotkeys, captureFull: "CmdOrCtrl+Alt+Shift+7" },
    });
    expect(config.hotkeys.captureFull).toBe("CmdOrCtrl+Alt+Shift+7");
    expect(issues.join(" ")).not.toMatch(/captureFull/);
  });

  it("drops a no-modifier hotkey to default and records an issue", () => {
    const { config, issues } = validateConfig({
      schemaVersion: 1,
      hotkeys: { ...DEFAULT_CONFIG.hotkeys, captureFull: "3" },
    });
    expect(config.hotkeys.captureFull).toBe(DEFAULT_CONFIG.hotkeys.captureFull);
    expect(issues.some((i) => i.includes("hotkeys.captureFull"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/config.test.ts`
Expected: FAIL — `captureFull: "3"` currently passes (`isStr`), no issue recorded.

- [ ] **Step 3: Implement the validator**

In `src/lib/config.ts`, add the import at the top:

```ts
import { validateAccelerator } from "@/lib/shortcuts";
```

Add the validator beside the other `Validator` consts (after `isStrOrNull`):

```ts
const isValidAccelerator: Validator = (v) =>
  typeof v === "string" && validateAccelerator(v).ok;
```

Change the `hotkeys` section of `validateConfig` from `isStr` to `isValidAccelerator`:

```ts
    hotkeys: vsec("hotkeys", r.hotkeys, d.hotkeys, {
      captureFull: isValidAccelerator,
      captureArea: isValidAccelerator,
      captureWindow: isValidAccelerator,
      showEditor: isValidAccelerator,
    }, issues),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/config.test.ts`
Expected: PASS. Then `pnpm vitest run` (full suite) green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts src/lib/config.test.ts
git commit -m "fix(hotkeys): reject invalid persisted hotkeys, fall back to defaults"
```

---

### Task 6: Recorder probe integration (`HotkeyRecorder.tsx`)

Validate at capture, reject Win/no-modifier with inline copy, and live-probe before accepting.

**Files:**
- Modify: `src/components/settings/HotkeyRecorder.tsx`

**Interfaces:**
- Consumes: `eventToAccelerator`, `validateAccelerator`, `statusMessage`, `formatShortcut`, type `HotkeyProbe` (Task 4); command `probe_hotkey` (Task 3).

- [ ] **Step 1: Rewrite `handleKey` and imports**

Replace the import line and `handleKey` in `src/components/settings/HotkeyRecorder.tsx`.

Imports:

```ts
import {
  eventToAccelerator,
  formatShortcut,
  validateAccelerator,
  statusMessage,
  type HotkeyProbe,
} from "@/lib/shortcuts";
```

Replace `handleKey` with an async version, and update the `onKeyDown` binding to `onKeyDown={(e) => void handleKey(e)}`:

```ts
async function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();

  const res = eventToAccelerator(e.nativeEvent);
  if (!res) return; // modifier-only / no key yet — keep listening
  if (!res.ok) {
    setError(
      res.reason === "win"
        ? "Windows reserves the ⊞ key — use Ctrl, Alt or Shift"
        : "Add a modifier (Ctrl, Alt or Shift)",
    );
    return;
  }

  const accel = res.accel;
  const v = validateAccelerator(accel);
  if (!v.ok) {
    setError(
      v.reason === "win"
        ? "Windows reserves the ⊞ key — use Ctrl, Alt or Shift"
        : v.reason === "reserved"
          ? `${accel} is reserved by the OS`
          : v.reason === "no-modifier"
            ? "Add a modifier (Ctrl, Alt or Shift)"
            : "Not a valid shortcut",
    );
    return;
  }

  let probe: HotkeyProbe = { status: "ok" };
  try {
    probe = await invoke<HotkeyProbe>("probe_hotkey", { accel });
  } catch (err) {
    // Probe failure shouldn't block the user; registration on save is the backstop.
    console.warn("probe_hotkey failed", err);
  }
  if (probe.status !== "ok") {
    setError(statusMessage(accel, probe.status) ?? "Can't use this shortcut");
    return;
  }

  setError(null);
  onChange(accel);
  setRecording(false);
  ref.current?.blur();
}
```

- [ ] **Step 2: Type-check + lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors. (No unit test — interaction is verified end-to-end in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/HotkeyRecorder.tsx
git commit -m "feat(hotkeys): live-probe and validate in recorder before accepting"
```

---

### Task 7: Settings report consumption + end-to-end verify (`SettingsView.tsx`)

Consume the per-action report from `reregister_shortcuts`; blame and revert only the edited action, with a reason-specific message. Then verify the whole flow in the running app.

**Files:**
- Modify: `src/components/settings/SettingsView.tsx:43-81` (`applyHotkey`)

**Interfaces:**
- Consumes: types `RegoResult`, `HotkeyAction`, `statusMessage` (Task 4); command `reregister_shortcuts` returning `RegoResult[]` (Task 2).

- [ ] **Step 1: Update imports**

Add to the existing imports in `src/components/settings/SettingsView.tsx`:

```ts
import { statusMessage, type RegoResult, type HotkeyAction } from "@/lib/shortcuts";
```

- [ ] **Step 2: Rewrite the registration tail of `applyHotkey`**

Replace the `await update("hotkeys", patch); try { await invoke("reregister_shortcuts"); } catch ...` block (lines ~65-80) with:

```ts
  await update("hotkeys", patch);
  let report: RegoResult[] = [];
  try {
    report = await invoke<RegoResult[]>("reregister_shortcuts");
  } catch (e) {
    console.error("reregister_shortcuts failed", e);
  }
  const mine = report.find((r) => r.action === (changedKey as HotkeyAction));
  if (mine && mine.status !== "ok") {
    await update("hotkeys", prev);
    await invoke("reregister_shortcuts").catch((e) =>
      console.error("reregister_shortcuts (revert) failed", e),
    );
    toast.error(statusMessage(mine.requested, mine.status) ?? "Could not register shortcut", {
      id: "hotkey-register-failed",
    });
  }
```

- [ ] **Step 3: Type-check, lint, full test suite**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: all green.

- [ ] **Step 4: End-to-end verify in the running app**

Run: `pnpm tauri dev`

Verify (on the available OS; Windows-specific cases noted):
1. Settings → Shortcuts → record `Ctrl+Shift+Space` → accepts and shows `Ctrl+Shift+Space` (Space fix; previously unbindable).
2. Record an already-taken combo → inline "already used by another app", not accepted.
3. (Windows) Press `Win+Shift+S` → inline "Windows reserves the ⊞ key…", not accepted.
4. Manually corrupt the store hotkey to `"3"` (or load an old config), relaunch → app still works on the other hotkeys; an `app:notice` toast lists the inactive one; `validateConfig` resets it to default on next save.
5. Set capture-area to a deliberately conflicting combo, confirm the OTHER three hotkeys still fire (non-atomic proof).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SettingsView.tsx
git commit -m "feat(hotkeys): per-action registration report with reason-specific feedback"
```

---

## Deferred / Optional (not required to fix the reported bug)

These are polish items from the spec, explicitly out of the core scope. Implement only if requested:

1. **Per-row status badges in the Shortcuts tab.** Listen for the `shortcuts://registration-report` event (already emitted in Task 2) in `SettingsView`, store the latest `RegoResult[]`, and render an "active / inactive (reason)" badge beside each `HotkeyRecorder`. Pure UI addition; no new backend.
2. **Soft-warn for single-modifier + common-key combos (Finding D).** In the recorder, after a successful probe, if the accel has exactly one modifier and the key is a single letter / arrow / Space / Enter / Backspace, show a yellow dismissible note ("This may interfere with everyday typing") — do NOT block. Advisory only.

## Self-Review

- **Spec coverage:** L1 recorder/validation → Tasks 4, 6. L2 probe → Task 3 + 6. L3 non-atomic registration → Task 2. L4 surfacing (edit-time + startup) → Tasks 7 (edit) + 2 (startup notice + event). L5 config hardening → Task 5. IPC types → Task 4 (hand-written, ts-rs absent — deviation noted in Global Constraints). Tests: Rust classify/plan_one (Tasks 1–2), frontend validateAccelerator/eventToAccelerator/statusMessage (Task 4), token round-trip incl. Space (Task 4), config no-modifier reset (Task 5). Findings #6 (Space) Task 4; #5 (Win) Tasks 4/6; #1 (validation) Task 5; #2 (atomic) Task 2; #3 (surfacing) Tasks 2/7. Constraints #7 (L/R collapse) and #8 (no chords) are documentation-only — covered in the spec's Out-of-scope; no task needed. Findings D (soft-warn) + per-row badges → Deferred section.
- **Placeholder scan:** none — every code step has full code; the only "manual" step (Task 3 Step 3) is a justified non-automatable live path, re-covered by Task 7 Step 4.
- **Type consistency:** Rust `RegoStatus` (`#[serde rename_all="lowercase"]`) ↔ TS `"ok"|"invalid"|"taken"|"reserved"`; Rust `HotkeyAction` (`camelCase`) ↔ TS `"captureFull"|...` ↔ config keys ↔ `changedKey`. `RegoResult { action, requested, effective, status }` identical both sides. `register_shortcuts` returns `Vec<RegoResult>` (Task 2) consumed as `RegoResult[]` (Task 7). `probe_hotkey` → `HotkeyProbe { status }` consumed in Task 6. `eventToAccelerator` new return shape (Task 4) consumed in Task 6. Consistent.
