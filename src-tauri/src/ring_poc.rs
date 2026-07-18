//! CP-0038 POC — command ring v2 (hold-to-summon, key-select, release-to-fire).
//!
//! THROWAWAY. This module exists to answer four unverified questions before the
//! real feature is designed. It is deliberately hardcoded: no config, no
//! Settings UI, no migration, no empty-slot handling. Do not promote it.
//!
//! Questions it answers, all visible in the log:
//!   Q1 `Released` semantics — when does the plugin emit Released for a
//!      multi-key combo? On the non-modifier key going up, or when the whole
//!      combo breaks? Do macOS and Windows agree? The log prints the elapsed
//!      time between Pressed and Released plus what the user reports holding.
//!   Q2 Can bare keys (A/S/D/F) be registered transiently while the leader is
//!      held, and do they actually fire?
//!   Q3 Does an always-on-top ring shown WITHOUT `set_focus()` still render and
//!      receive its highlight events — while the user's app keeps focus?
//!   Q4 Does teardown reliably release the bare keys on every exit path?

use std::sync::Mutex;
use std::time::Instant;

use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::shortcuts::CaptureKind;
use crate::windows;

/// Hardcoded leader. Real feature makes this configurable.
const LEADER: &str = "CmdOrCtrl+Shift+Space";

/// Hardcoded slot keys → capture mode. Real feature makes this an assignable
/// four-slot map. Bare single keys on purpose: proving they register is Q2.
const SLOTS: [(&str, &str); 4] = [
    ("A", "window"),
    ("S", "full"),
    ("D", "scroll"),
    ("F", "area"),
];

/// Live gesture state. `None` when the ring is down.
struct Gesture {
    /// Which slot is highlighted, if the user has tapped a slot key.
    highlighted: Option<&'static str>,
    /// When the leader went down — used to time the Pressed→Released gap.
    pressed_at: Instant,
}

static STATE: Mutex<Option<Gesture>> = Mutex::new(None);

/// Register the POC leader. Called once at startup, after the normal shortcuts.
pub fn register<R: Runtime>(app: &AppHandle<R>) {
    let sc: Shortcut = match LEADER.parse() {
        Ok(s) => s,
        Err(e) => {
            log::error!("[ring-poc] leader {LEADER} failed to parse: {e:?}");
            return;
        }
    };
    let app2 = app.clone();
    let res = app.global_shortcut().on_shortcut(sc, move |_a, _s, event| {
        match event.state {
            ShortcutState::Pressed => on_leader_down(&app2),
            ShortcutState::Released => on_leader_up(&app2),
        }
    });
    match res {
        Ok(()) => log::info!("[ring-poc] leader registered: {LEADER}"),
        Err(e) => log::error!("[ring-poc] leader registration failed: {e}"),
    }
}

fn on_leader_down<R: Runtime>(app: &AppHandle<R>) {
    {
        let mut st = STATE.lock().unwrap();
        if st.is_some() {
            // Auto-repeat while held, or a second Pressed with no Released.
            // Q1 evidence: if this fires repeatedly while you hold the combo,
            // the OS is auto-repeating and the real feature must debounce.
            log::warn!("[ring-poc] LEADER PRESSED again with gesture already active (auto-repeat?)");
            return;
        }
        *st = Some(Gesture { highlighted: None, pressed_at: Instant::now() });
    }
    log::info!("[ring-poc] LEADER PRESSED — showing ring WITHOUT focus, arming slot keys");

    if let Err(e) = windows::show_command_ring_unfocused(app) {
        log::error!("[ring-poc] show_command_ring_unfocused failed: {e}");
        teardown(app);
        return;
    }
    // MUST be deferred: calling `global_shortcut().on_shortcut()` from inside a
    // global-shortcut callback DEADLOCKS the whole app (the plugin holds an
    // internal lock while dispatching this handler, and the handler runs on the
    // main thread — so the machine appears to freeze). Hop off the callback
    // first. See FINDINGS.md.
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move { arm_slot_keys(&app2) });
}

fn on_leader_up<R: Runtime>(app: &AppHandle<R>) {
    let gesture = STATE.lock().unwrap().take();
    let Some(g) = gesture else {
        log::warn!("[ring-poc] LEADER RELEASED with no active gesture — ignoring");
        return;
    };
    let held_ms = g.pressed_at.elapsed().as_millis();

    // Q1: compare this against how long you actually held the combo, and note
    // whether releasing ONLY Space (keeping Cmd+Shift down) got you here.
    log::info!(
        "[ring-poc] LEADER RELEASED after {held_ms}ms — highlighted={:?}",
        g.highlighted
    );

    // Same deadlock hazard as arming — defer off the callback.
    let app_disarm = app.clone();
    tauri::async_runtime::spawn(async move { disarm_slot_keys(&app_disarm) });
    windows::close_command_ring(app);

    match g.highlighted {
        Some(kind) => {
            log::info!("[ring-poc] FIRING capture: {kind}");
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
        // Nothing tapped → cancel. Deliberate: an accidental capture is worse
        // than a no-op, so there is no pre-selected slot.
        None => log::info!("[ring-poc] CANCELLED — nothing highlighted, captured nothing"),
    }
}

/// Q2: register the bare slot keys for the duration of the hold.
///
/// NEVER call this synchronously from inside a global-shortcut callback — see
/// the deadlock note in `on_leader_down`.
fn arm_slot_keys<R: Runtime>(app: &AppHandle<R>) {
    for (key, kind) in SLOTS {
        let sc: Shortcut = match key.parse() {
            Ok(s) => s,
            Err(e) => {
                log::error!("[ring-poc] slot key {key} failed to parse: {e:?}");
                continue;
            }
        };
        let app2 = app.clone();
        let res = app.global_shortcut().on_shortcut(sc, move |_a, _s, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let mut st = STATE.lock().unwrap();
            let Some(g) = st.as_mut() else { return };
            // Tapping several keys keeps only the last — nothing fires until
            // the leader is released, so the user can change their mind.
            g.highlighted = Some(kind);
            log::info!("[ring-poc] SLOT KEY {key} -> highlight={kind}");
            let _ = app2.emit_to("command-ring", "ring-poc:highlight", kind);
        });
        match res {
            Ok(()) => log::info!("[ring-poc] armed slot key {key} -> {kind}"),
            // Expected failure mode worth seeing: the key is already registered
            // globally by capz or another app.
            Err(e) => log::error!("[ring-poc] FAILED to arm slot key {key}: {e}"),
        }
    }
}

/// Q4: unconditional teardown. Must run on EVERY exit path or the bare keys
/// stay swallowed system-wide until capz restarts.
fn disarm_slot_keys<R: Runtime>(app: &AppHandle<R>) {
    for (key, _) in SLOTS {
        match key.parse::<Shortcut>() {
            Ok(sc) => match app.global_shortcut().unregister(sc) {
                Ok(()) => log::info!("[ring-poc] disarmed slot key {key}"),
                Err(e) => log::error!("[ring-poc] FAILED to disarm slot key {key}: {e}"),
            },
            Err(e) => log::error!("[ring-poc] slot key {key} unparseable on teardown: {e:?}"),
        }
    }
}

/// Abort with no capture. Used when showing the ring fails.
fn teardown<R: Runtime>(app: &AppHandle<R>) {
    *STATE.lock().unwrap() = None;
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move { disarm_slot_keys(&app2) });
    windows::close_command_ring(app);
}

/// Emergency release, wired to app exit so a crash mid-gesture cannot leave the
/// bare keys registered.
pub fn release_all<R: Runtime>(app: &AppHandle<R>) {
    if STATE.lock().unwrap().is_some() {
        log::warn!("[ring-poc] exiting mid-gesture — releasing slot keys");
    }
    *STATE.lock().unwrap() = None;
    // Synchronous on purpose: this runs at exit and is NOT inside a
    // global-shortcut callback, so there is no deadlock hazard — and a spawned
    // task might never run before the process dies, leaking the bare keys.
    disarm_slot_keys(app);
    windows::close_command_ring(app);
}
