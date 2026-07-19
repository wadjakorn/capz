//! CP-0038 POC v3 — alt+tab-style hold ring.
//!
//! THROWAWAY. Hardcoded; no config, no Settings UI. See FINDINGS.md.
//!
//! ## The question this answers
//! The user wants alt+tab behaviour: hold, cycle, and the ring VANISHES on
//! release. F2 established the shortcut plugin cannot see modifier release, and
//! an event tap was ruled out (CP-0037(b)). v3 tries the remaining option:
//! POLL the current modifier state (`modifiers::current`) while the ring is
//! open, and close the moment the modifiers are no longer held.
//!
//! A state query is not interception — no hook, no permission, and capz cannot
//! see or suppress any keystroke. **If polling turns out to require
//! Accessibility, this approach is dead** and CP-0038 has no non-interception
//! path. That is the single thing this POC is testing.
//!
//! ## Interaction
//!   Hold Cmd+Shift, tap A to cycle the highlight, release Cmd or Shift to fire.
//!   Releasing with nothing cycled cannot happen — the first tap IS the open.
//!
//! Everything v2 accumulated to work around the missing release signal — Enter
//! to commit, Backspace to cancel, transient Escape (F10), the idle timeout —
//! is GONE. If v3 works, it is strictly simpler than v2.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Listener, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::modifiers;
use crate::shortcuts::CaptureKind;
use crate::windows;

const CYCLE: &str = "CmdOrCtrl+Shift+A";

/// How often to sample the modifier state while the ring is open. 50ms is
/// ~3 frames — fast enough that release feels instant, slow enough to be
/// invisible in CPU terms. Polling runs ONLY while the ring is up.
const POLL: Duration = Duration::from_millis(50);

/// Cycle order. Matches the ring's clockwise-from-top wedge order so the
/// highlight visibly walks around the ring rather than jumping.
const MODES: [&str; 4] = ["window", "full", "scroll", "area"];

/// Index into `MODES`, or `None` when the ring is down.
static SELECTED: Mutex<Option<usize>> = Mutex::new(None);

/// Bumped whenever the ring closes, so an in-flight poll loop from a previous
/// gesture exits instead of acting on the new one.
static GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn register<R: Runtime>(app: &AppHandle<R>) {
    // The ring webview cannot receive the initial highlight until it has
    // mounted its listener, and the window is created and emitted to in the same
    // breath — so the first emit is always lost. The page announces readiness
    // instead of us guessing a delay.
    let app_ready = app.clone();
    app.listen("ring-poc:ready", move |_| {
        if let Some(idx) = *SELECTED.lock().unwrap() {
            log::info!("[ring-poc] ring ready — replaying highlight {}", MODES[idx]);
            let _ = app_ready.emit_to("command-ring", "ring-poc:highlight", MODES[idx]);
        }
    });

    if modifiers::current().is_none() {
        log::error!("[ring-poc] modifier polling unsupported on this platform — v3 cannot run");
        return;
    }
    for accel in [CYCLE] {
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
                on_cycle(&app2);
            }
        });
        match res {
            Ok(()) => log::info!("[ring-poc] registered {accel} (cycle)"),
            // Expected and worth seeing: another app may already own the combo.
            // In v1, Cmd+Shift+F silently did nothing for exactly this reason.
            Err(e) => {
                log::error!("[ring-poc] FAILED to register {accel}: {e} — combo likely taken")
            }
        }
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
        // Re-triggering the ring abandons any capture still in progress: an
        // area/window overlay left open from a previous trigger would otherwise
        // sit under the ring and swallow the next selection. Cancelling is the
        // safe direction — it captures nothing.
        windows::close_overlays(app);
        if let Err(e) = windows::show_command_ring_unfocused(app) {
            log::error!("[ring-poc] show_command_ring_unfocused failed: {e}");
            *SELECTED.lock().unwrap() = None;
            return;
        }
    } else {
        log::info!("[ring-poc] CYCLE -> {}", MODES[idx]);
    }

    let _ = app.emit_to("command-ring", "ring-poc:highlight", MODES[idx]);
    if first {
        start_release_poll(app);
    }
}

/// Watch for the modifiers coming up, then fire. This is the whole v3 idea.
fn start_release_poll<R: Runtime>(app: &AppHandle<R>) {
    let generation = GENERATION.load(Ordering::SeqCst);
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(POLL).await;
            // A newer gesture (or a close) superseded this loop.
            if GENERATION.load(Ordering::SeqCst) != generation {
                return;
            }
            let Some(m) = modifiers::current() else {
                log::error!("[ring-poc] modifier read failed mid-gesture — closing");
                close_and_clear(&app2);
                return;
            };
            if m.command && m.shift {
                continue;
            }
            log::info!("[ring-poc] MODIFIERS RELEASED (cmd={} shift={})", m.command, m.shift);
            fire(&app2);
            return;
        }
    });
}

/// Fire the highlighted mode and drop the ring.
fn fire<R: Runtime>(app: &AppHandle<R>) {
    let Some(idx) = close_and_clear(app) else {
        return;
    };
    let kind = MODES[idx];
    log::info!("[ring-poc] FIRING {kind}");
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

/// Close the ring and clear state, returning what was highlighted.
fn close_and_clear<R: Runtime>(app: &AppHandle<R>) -> Option<usize> {
    let idx = SELECTED.lock().unwrap().take();
    GENERATION.fetch_add(1, Ordering::SeqCst);
    windows::close_command_ring(app);
    idx
}

/// Exit path. v3 registers nothing transiently, so this only drops the ring.
pub fn release_all<R: Runtime>(app: &AppHandle<R>) {
    if SELECTED.lock().unwrap().take().is_some() {
        log::warn!("[ring-poc] exiting with ring up — closing it");
        GENERATION.fetch_add(1, Ordering::SeqCst);
        windows::close_command_ring(app);
    }
}
