//! CP-0038 POC v2 — cycle-and-commit command ring.
//!
//! THROWAWAY. Hardcoded on purpose: no config, no Settings UI, no migration.
//! Do not promote it. Findings go in FINDINGS.md.
//!
//! ## Why this shape
//! POC v1 tried a Cmd+Tab-style hold gesture and hit three walls (FINDINGS.md):
//!   F1 registering a shortcut inside a shortcut callback DEADLOCKS the app
//!   F2 `Released` fires when the non-modifier key lifts, not when modifiers
//!      release — so "release the modifiers to commit" is unobservable
//!   F6 while Cmd+Shift are held, pressing A emits `Cmd+Shift+A`, so bare-key
//!      slot shortcuts never match during a hold
//!
//! v2 leans into F6 instead of fighting it. Every interaction is an ordinary
//! registrable combo, registered ONCE at startup and never touched again:
//!
//!   Cmd+Shift+A      cycle — opens the ring, then advances the highlight
//!   Cmd+Shift+Enter  commit — fires the highlighted mode
//!   Cmd+Shift+Backspace cancel — closes the ring, captures nothing
//!
//! Consequences: no transient arm/disarm, so F1's deadlock constraint and F5's
//! key-leak race are both designed out rather than worked around. Nothing is
//! ever swallowed from the focused app except these three combos. The user does
//! NOT need to keep any key depressed — the hold is no longer load-bearing.
//!
//! ## What this POC is still testing
//!   Q1 Does repeated cycling feel good enough to justify the ring at all? Each
//!      slot combo is bindable directly today, so the ring's ONLY value is the
//!      visual feedback while choosing.
//!   Q2 Does the highlight render in a webview that never has focus?
//!   Q3 Does the idle auto-cancel prevent a stuck ring without ever firing a
//!      capture the user did not ask for?

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::shortcuts::CaptureKind;
use crate::windows;

const CYCLE: &str = "CmdOrCtrl+Shift+A";
const COMMIT: &str = "CmdOrCtrl+Shift+Enter";
// Backspace, not Delete: the key labelled "delete" on Mac keyboards IS
// Backspace. Tauri's `Delete` is forward-delete, which many Macs lack entirely.
const CANCEL: &str = "CmdOrCtrl+Shift+Backspace";

/// Cycle order. Matches the ring's clockwise-from-top wedge order so the
/// highlight visibly walks around the ring rather than jumping.
const MODES: [&str; 4] = ["window", "full", "scroll", "area"];

/// The ring closes on its own after this long with no cycle keypress, so a
/// forgotten ring never sits on screen. Auto-cancel NEVER fires a capture —
/// an unrequested screenshot is far worse than a no-op.
const IDLE_CANCEL: Duration = Duration::from_secs(6);

/// Index into `MODES`, or `None` when the ring is down.
static SELECTED: Mutex<Option<usize>> = Mutex::new(None);

/// Bumped on every state change. The idle-cancel task captures the value it was
/// spawned with and does nothing if it no longer matches — so a stale timer can
/// never close a ring the user has since interacted with.
static GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug)]
enum Action {
    Cycle,
    Commit,
    Cancel,
}

pub fn register<R: Runtime>(app: &AppHandle<R>) {
    for (accel, action) in [
        (CYCLE, Action::Cycle),
        (COMMIT, Action::Commit),
        (CANCEL, Action::Cancel),
    ] {
        let sc: Shortcut = match accel.parse() {
            Ok(s) => s,
            Err(e) => {
                log::error!("[ring-poc] {accel} failed to parse: {e:?}");
                continue;
            }
        };
        let app2 = app.clone();
        let res = app.global_shortcut().on_shortcut(sc, move |_a, _s, event| {
            if event.state == ShortcutState::Pressed {
                dispatch(&app2, action);
            }
        });
        match res {
            Ok(()) => log::info!("[ring-poc] registered {accel} -> {action:?}"),
            // Expected and worth seeing: another app may already own the combo.
            // In v1, Cmd+Shift+F silently did nothing for exactly this reason.
            Err(e) => {
                log::error!("[ring-poc] FAILED to register {accel}: {e} — combo likely taken")
            }
        }
    }
}

fn dispatch<R: Runtime>(app: &AppHandle<R>, action: Action) {
    match action {
        Action::Cycle => on_cycle(app),
        Action::Commit => on_commit(app),
        Action::Cancel => on_cancel(app),
    }
}

fn on_cycle<R: Runtime>(app: &AppHandle<R>) {
    let (idx, first) = {
        let mut sel = SELECTED.lock().unwrap();
        match *sel {
            None => {
                *sel = Some(0);
                (0, true)
            }
            Some(i) => {
                let next = (i + 1) % MODES.len();
                *sel = Some(next);
                (next, false)
            }
        }
    };

    if first {
        log::info!("[ring-poc] CYCLE (open) -> {}", MODES[idx]);
        if let Err(e) = windows::show_command_ring_unfocused(app) {
            log::error!("[ring-poc] show_command_ring_unfocused failed: {e}");
            *SELECTED.lock().unwrap() = None;
            return;
        }
    } else {
        log::info!("[ring-poc] CYCLE -> {}", MODES[idx]);
    }

    let _ = app.emit_to("command-ring", "ring-poc:highlight", MODES[idx]);
    arm_idle_cancel(app);
}

fn on_commit<R: Runtime>(app: &AppHandle<R>) {
    let Some(idx) = SELECTED.lock().unwrap().take() else {
        log::warn!("[ring-poc] COMMIT with ring down — ignoring");
        return;
    };
    GENERATION.fetch_add(1, Ordering::SeqCst);
    let kind = MODES[idx];
    log::info!("[ring-poc] COMMIT -> firing {kind}");
    windows::close_command_ring(app);

    let app2 = app.clone();
    let kind = kind.to_string();
    tauri::async_runtime::spawn(async move {
        let parsed = match kind.as_str() {
            "full" => CaptureKind::Full,
            "area" => CaptureKind::Area,
            "window" => CaptureKind::Window,
            "scroll" => CaptureKind::Scroll,
            other => {
                log::error!("[ring-poc] unknown kind {other}");
                return;
            }
        };
        if let Err(e) = crate::capture_dispatch::trigger_capture(app2, parsed).await {
            log::error!("[ring-poc] trigger_capture failed: {e}");
        }
    });
}

fn on_cancel<R: Runtime>(app: &AppHandle<R>) {
    if SELECTED.lock().unwrap().take().is_none() {
        log::warn!("[ring-poc] CANCEL with ring down — ignoring");
        return;
    }
    GENERATION.fetch_add(1, Ordering::SeqCst);
    log::info!("[ring-poc] CANCEL — captured nothing");
    windows::close_command_ring(app);
}

/// Restart the idle timer. Safe to call from inside a shortcut callback: it
/// spawns and returns, and never touches the global-shortcut plugin (which is
/// what deadlocked v1 — see F1).
fn arm_idle_cancel<R: Runtime>(app: &AppHandle<R>) {
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(IDLE_CANCEL).await;
        // Superseded by a later keypress, commit, or cancel — do nothing.
        if GENERATION.load(Ordering::SeqCst) != generation {
            return;
        }
        if SELECTED.lock().unwrap().take().is_none() {
            return;
        }
        log::info!("[ring-poc] IDLE TIMEOUT — closing ring, captured nothing");
        windows::close_command_ring(&app2);
    });
}

/// Nothing is transiently registered in v2, so exit needs only to drop the ring.
pub fn release_all<R: Runtime>(app: &AppHandle<R>) {
    if SELECTED.lock().unwrap().take().is_some() {
        log::warn!("[ring-poc] exiting with ring up — closing it");
        windows::close_command_ring(app);
    }
}
