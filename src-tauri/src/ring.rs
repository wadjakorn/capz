//! Command ring v2 — alt+tab-style hold / cycle / release (CP-0038).
//!
//! # The gesture
//!
//! Hold the ring's modifiers and tap its key: the ring appears **without taking
//! focus**. Tap again to advance the highlight. Release the modifiers and the
//! highlighted mode fires and the ring vanishes — exactly like alt+tab.
//!
//! The last slot in the cycle is always `CANCEL`, which fires nothing: it is
//! how a gesture is backed out of without a globally-registered Escape.
//!
//! # Why it is built this way
//!
//! The global-shortcut plugin reports the *trigger key* going down and up, but
//! never the *modifiers* going up — so "release to fire" cannot be driven by
//! shortcut events. The alternatives were:
//!
//!   1. An event tap (`CGEventTap` / `WH_KEYBOARD_LL`) — sees real key-up, but
//!      needs macOS Accessibility and lets capz observe every keystroke on the
//!      machine. **Rejected**; this is why CP-0037(b) was skipped.
//!   2. Registering a transient accelerator per slot while the ring is open —
//!      prototyped and abandoned. Registering from inside a shortcut callback
//!      re-enters the plugin's lock on the main thread and **deadlocks the
//!      whole desktop**, and a failed teardown leaves a global key swallowed
//!      for the rest of the session.
//!   3. Polling the modifier *state* while the ring is open — what this does.
//!
//! Polling asks "are these keys down right now?" (see `modifiers`). It requires
//! no permission, cannot see which keys are pressed, and cannot suppress
//! anything. **Do not replace it with an event tap**, and do not reintroduce
//! transient registration; both were tried and both are recorded failures.
//!
//! The loop runs *only* while the ring is open — never in the background.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Listener, Runtime};
use tauri_plugin_store::StoreExt;

use crate::modifiers::{self, Mods};
use crate::services::config_store::{config_store_path, CONFIG_STORE_KEY};
use crate::shortcuts::CaptureKind;
use crate::windows;

/// How often to sample the modifier state while the ring is open. ~3 frames:
/// fast enough that release feels instant, cheap enough to be unmeasurable —
/// and it only ticks during a gesture.
const POLL: Duration = Duration::from_millis(50);

/// Capture modes that may occupy a ring slot. Mirrors `RING_MODE_IDS` in
/// `src/lib/commandRing.ts` — hand-kept in sync (CLAUDE.md: no codegen).
pub const RING_MODES: [&str; 5] = ["window", "full", "scroll", "area", "systemArea"];

pub const RING_MIN_MODES: usize = 1;
pub const RING_MAX_MODES: usize = 4;

/// The cancel slot: always the last slot in the cycle, never configurable.
///
/// Releasing always fires whatever is highlighted, so without a slot that fires
/// *nothing* a gesture cannot be backed out of once started. A global Escape
/// while the ring is up would be the transient registration this design rules
/// out — it swallows Escape system-wide and a failed teardown leaves it that
/// way for the session. Mirrors `RING_CANCEL` in commandRing.ts.
pub const CANCEL: &str = "cancel";

/// Default slot assignment, matching `DEFAULT_CONFIG.ring.modes`.
const DEFAULT_MODES: [&str; 4] = ["window", "full", "scroll", "area"];

/// The live gesture: which slots are on the ring and which one is highlighted.
/// `None` = the ring is down.
///
/// One gesture per process. The ring is a single global window driven by a
/// global hotkey, so there is nothing to key a per-instance state off — but it
/// does mean this state is shared by every window and thread in the app.
struct Gesture {
    modes: Vec<String>,
    index: usize,
    /// Modifiers whose release ends the gesture — derived from the accelerator
    /// that opened it, so a rebound hotkey polls the right keys.
    hold: Mods,
    /// Identity of this gesture. A poll loop carries the generation it was
    /// spawned for and exits as soon as the live gesture is a different one.
    ///
    /// This lives INSIDE the gesture rather than in a separate atomic on
    /// purpose. With the counter outside, closing was two steps — take the
    /// gesture, then bump — and a re-tap landing between them would open a new
    /// gesture whose poll loop read the stale generation, then get retired by
    /// the bump it had already raced past. That left `GESTURE` occupied with no
    /// window and no loop: a ring stuck open that no further tap could recover.
    /// Tying identity to the gesture makes "is this loop still current?" a
    /// single read under one lock, with no ordering to get wrong.
    generation: u64,
}

static GESTURE: Mutex<Option<Gesture>> = Mutex::new(None);

/// Issues gesture generations. Only ever incremented.
static NEXT_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Is modifier polling available here? If not, v2 cannot work at all and the
/// caller must not register its accelerator.
pub fn is_supported() -> bool {
    modifiers::current().is_some()
}

/// Install the ring-ready handshake. Call once at startup.
///
/// The ring webview cannot receive its opening highlight until it has mounted a
/// listener, but Rust creates the window and emits in the same breath — so that
/// first emit is always lost and the ring opens with nothing highlighted. The
/// page announces readiness instead of us guessing a delay that would be a race
/// on a slow machine either way.
pub fn init<R: Runtime>(app: &AppHandle<R>) {
    let app_ready = app.clone();
    app.listen("ring:ready", move |_| {
        let Some(state) = current_highlight() else {
            return;
        };
        let _ = app_ready.emit_to(windows::COMMAND_RING_LABEL, "ring:highlight", state);
    });
}

/// Snapshot of the ring for the frontend: what to draw, and what is selected.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RingState {
    modes: Vec<String>,
    index: usize,
}

fn current_highlight() -> Option<RingState> {
    let g = GESTURE.lock().unwrap();
    g.as_ref().map(|g| RingState {
        modes: g.modes.clone(),
        index: g.index,
    })
}

/// Read the configured slot list, clamped to 1–4 known modes.
///
/// Mirrors `vRing` on the TypeScript side. Both ends validate because the store
/// is hand-editable JSON and a config written by a newer build may name modes
/// this one doesn't know: an empty or over-long list must never reach the ring.
fn read_modes<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let defaults = || DEFAULT_MODES.iter().map(|s| s.to_string()).collect();
    let Ok(path) = config_store_path(app) else {
        return defaults();
    };
    let Ok(store) = app.store(path) else {
        return defaults();
    };
    let Some(v) = store.get(CONFIG_STORE_KEY) else {
        return defaults();
    };
    let Some(arr) = v.get("ring").and_then(|r| r.get("modes")).and_then(|m| m.as_array()) else {
        return defaults();
    };

    let mut modes: Vec<String> = Vec::new();
    for entry in arr {
        let Some(s) = entry.as_str() else { continue };
        if !RING_MODES.contains(&s) {
            log::warn!("ring: unknown mode {s:?} in config, ignoring");
            continue;
        }
        // macOS-only mode: a config synced from a Mac would otherwise render a
        // slot that can never fire. Skipping keeps the ring honest; the min-1
        // check below catches the case where it was the ONLY mode.
        if s == "systemArea" && !cfg!(target_os = "macos") {
            log::info!("ring: skipping macOS-only mode systemArea");
            continue;
        }
        if modes.iter().any(|m| m == s) {
            continue;
        }
        modes.push(s.to_string());
        if modes.len() == RING_MAX_MODES {
            break;
        }
    }

    if modes.len() < RING_MIN_MODES {
        log::warn!("ring: no usable modes configured, falling back to defaults");
        return defaults();
    }
    modes
}

/// The ring's accelerator fired. First press opens; each subsequent press
/// advances the highlight. Called from `shortcuts::dispatch_action`.
pub fn on_trigger<R: Runtime>(app: &AppHandle<R>, accel: &str) {
    let hold = modifiers::from_accelerator(accel);
    if hold.is_empty() {
        // Nothing to release means the gesture could never end: the ring would
        // open and hang there. Refuse rather than strand it on screen.
        log::warn!("ring: accelerator {accel:?} has no modifiers; hold gesture needs at least one");
        return;
    }

    // `Some(generation)` if this press opened the ring, `None` if it advanced an
    // existing one. The generation is issued under the same lock that installs
    // the gesture, so the loop spawned below can never be handed a stale one.
    let opened: Option<u64> = {
        let mut g = GESTURE.lock().unwrap();
        match g.as_mut() {
            Some(active) => {
                active.index = (active.index + 1) % active.modes.len();
                None
            }
            None => {
                // Cancel rides at the end of the cycle, so tapping past the
                // last capture mode lands on "do nothing" rather than wrapping
                // straight back to the first.
                let mut modes = read_modes(app);
                modes.push(CANCEL.to_string());
                let generation = NEXT_GENERATION.fetch_add(1, Ordering::SeqCst);
                *g = Some(Gesture { modes, index: 0, hold, generation });
                Some(generation)
            }
        }
    };

    if opened.is_some() {
        // Re-triggering abandons any capture still in progress: an area/window
        // overlay left open from a previous trigger would otherwise sit under
        // the ring and swallow the next selection. Cancelling is the safe
        // direction — it captures nothing and loses nothing.
        windows::close_overlays(app);
        if let Err(e) = windows::show_command_ring_unfocused(app) {
            log::error!("ring: show_command_ring_unfocused failed: {e}");
            *GESTURE.lock().unwrap() = None;
            return;
        }
    }

    if let Some(state) = current_highlight() {
        let _ = app.emit_to(windows::COMMAND_RING_LABEL, "ring:highlight", state);
    }
    if let Some(generation) = opened {
        start_release_poll(app, generation);
    }
}

/// Watch for the hold modifiers coming up, then fire. This is the whole idea.
fn start_release_poll<R: Runtime>(app: &AppHandle<R>, generation: u64) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(POLL).await;
            // One locked read answers both "is the ring still up?" and "is it
            // still MY gesture?" — a closed ring or a newer one retires us.
            let hold = {
                let g = GESTURE.lock().unwrap();
                match g.as_ref() {
                    Some(g) if g.generation == generation => g.hold,
                    _ => return,
                }
            };
            let Some(now) = modifiers::current() else {
                // Should be unreachable (registration is gated on
                // `is_supported`), but a stuck-open ring is the worst outcome
                // here, so close instead of firing something unintended.
                log::error!("ring: modifier read failed mid-gesture — closing without firing");
                close(&app);
                return;
            };
            if hold.all_held_in(&now) {
                continue;
            }
            fire(&app);
            return;
        }
    });
}

/// Fire the highlighted mode and drop the ring.
fn fire<R: Runtime>(app: &AppHandle<R>) {
    let Some(kind) = close(app) else { return };
    if kind == CANCEL {
        log::info!("ring: cancelled");
        return;
    }
    log::info!("ring: firing {kind}");
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let parsed = match kind.as_str() {
            "full" => CaptureKind::Full,
            "area" => CaptureKind::Area,
            "window" => CaptureKind::Window,
            "scroll" => CaptureKind::Scroll,
            "systemArea" => CaptureKind::SystemArea,
            other => {
                log::error!("ring: unknown mode {other}");
                return;
            }
        };
        // `as_layer: false` — a ring capture replaces, like the hotkey and v1
        // ring paths. Only the editor's explicit capture-as-layer button passes
        // true (CP-0041).
        if let Err(e) = crate::capture_dispatch::trigger_capture(app, parsed, false).await {
            log::error!("ring: trigger_capture failed: {e}");
        }
    });
}

/// Close the ring and clear state, returning the mode that was highlighted.
fn close<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    // Clearing the gesture is all it takes to retire its poll loop: the loop
    // matches on generation, so it stops whether the ring closed or a newer
    // gesture replaced it. No separate counter to bump, and no window between
    // the two where a re-tap could be stranded.
    let selected = GESTURE
        .lock()
        .unwrap()
        .take()
        .map(|g| g.modes[g.index].clone());
    windows::close_command_ring(app);
    selected
}

/// Exit path. Nothing is registered transiently, so this only drops the ring.
/// Deliberately synchronous: a spawned task may never run before process death.
pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
    if GESTURE.lock().unwrap().take().is_some() {
        log::warn!("ring: exiting with the ring up — closing it");
        windows::close_command_ring(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cycling wraps and visits every slot in order — the property the whole
    /// gesture rests on, since release fires whatever is highlighted.
    fn cycle(len: usize, taps: usize) -> Vec<usize> {
        let mut idx = 0usize;
        let mut seen = vec![0usize];
        for _ in 0..taps {
            idx = (idx + 1) % len;
            seen.push(idx);
        }
        seen
    }

    #[test]
    fn cycling_wraps_in_order() {
        assert_eq!(cycle(4, 5), vec![0, 1, 2, 3, 0, 1]);
        // A single-slot ring is legal: every tap keeps the one mode selected.
        assert_eq!(cycle(1, 3), vec![0, 0, 0, 0]);
    }

    /// The cycle is modes + cancel, so cancel is always reachable and always
    /// last — a user who taps past the final capture mode lands on "do nothing"
    /// rather than wrapping to the first mode and firing it by surprise.
    #[test]
    fn cancel_is_the_last_slot_and_is_reachable() {
        let mut cycle: Vec<String> = DEFAULT_MODES.iter().map(|s| s.to_string()).collect();
        cycle.push(CANCEL.to_string());
        assert_eq!(cycle.last().unwrap(), CANCEL);
        // Tapping once per slot visits every mode and ends on cancel.
        assert_eq!(cycle.len(), DEFAULT_MODES.len() + 1);
        assert_eq!(cycle[(cycle.len() - 1) % cycle.len()], CANCEL);
    }

    /// Cancel must never be assignable as a capture mode, or it could be
    /// configured away (or duplicated) via the store.
    #[test]
    fn cancel_is_not_a_configurable_mode() {
        assert!(!RING_MODES.contains(&CANCEL));
    }

    #[test]
    fn defaults_are_a_valid_slot_list() {
        assert!(DEFAULT_MODES.len() >= RING_MIN_MODES);
        assert!(DEFAULT_MODES.len() <= RING_MAX_MODES);
        for m in DEFAULT_MODES {
            assert!(RING_MODES.contains(&m), "{m} is not a known ring mode");
        }
    }

    /// Guards the hand-sync with `RING_MODE_IDS` in commandRing.ts: the ring
    /// must be able to offer at least as many modes as it has slots.
    #[test]
    fn there_are_enough_modes_to_fill_the_ring() {
        assert!(RING_MODES.len() >= RING_MAX_MODES);
    }

    /// An accelerator with no modifiers cannot drive a hold gesture — there is
    /// nothing whose release would end it.
    #[test]
    fn modifierless_accelerator_is_rejected() {
        assert!(modifiers::from_accelerator("F13").is_empty());
        assert!(!modifiers::from_accelerator("CmdOrCtrl+Shift+Space").is_empty());
    }
}
