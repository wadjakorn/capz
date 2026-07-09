//! Scrolling capture (long page): manual scroll + auto-stitch.
//!
//! Flow (ticket ZMiHIiEy6TEc):
//! 1. The user selects a region in the overlay (`mode=scroll`), which invokes
//!    [`scroll_capture_start_command`]. That hides the selection overlays, grabs
//!    the first frame, opens the compact HUD window, and starts a background
//!    sampler.
//! 2. The sampler re-captures the region every [`SAMPLE_INTERVAL_MS`], de-dupes
//!    unchanged frames, and stitches new content onto the accumulator via
//!    [`crate::services::stitch`]. It emits `scroll://progress` to the HUD.
//! 3. The user scrolls the target app. When done they press Capture (Enter) →
//!    [`scroll_capture_finish_command`] encodes the tall PNG and opens it in the
//!    editor, or Cancel (Esc) → [`scroll_capture_cancel_command`] discards it
//!    with no temp file written.

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::services::{capture_service, stitch};
use crate::state::{AppState, ScrollSession};
use crate::windows;

/// How often the sampler re-captures the region while the user scrolls.
const SAMPLE_INTERVAL_MS: u64 = 250;

/// Rows at the top and bottom of each frame ignored during seam matching so a
/// fixed toolbar/header doesn't pin the alignment. Physical pixels.
const EXCLUDE_BAND: u32 = 48;

/// Live progress pushed to the HUD after each sample.
#[derive(Clone, serde::Serialize)]
struct ScrollProgress {
    /// Distinct frames stitched so far.
    frames: u32,
    /// Current stitched image height in physical pixels.
    height: u32,
    /// Number of low-confidence seams so far (0 = clean).
    warnings: u32,
}

/// Begin a scrolling capture over the given physical-pixel region of
/// `monitor_id`. Same coordinate contract as `capture_region_command`.
#[tauri::command]
pub async fn scroll_capture_start_command<R: Runtime>(
    app: AppHandle<R>,
    monitor_id: u32,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<(), String> {
    // Fast-fail if a session is already running, so we don't hide overlays and
    // grab a throwaway frame for nothing. This is only a best-effort check — the
    // lock is released here, so the authoritative guard is the atomic
    // check-and-insert below.
    {
        let st = app.state::<AppState>();
        if st.scroll.lock().expect("scroll mutex poisoned").is_some() {
            return Err("scroll capture already in progress".into());
        }
    }

    // Hide the selection overlays before the first grab so they don't bleed in.
    windows::hide_overlays_and_wait(&app).await?;

    let first = tokio::task::spawn_blocking(move || {
        capture_service::capture_region(monitor_id, x, y, w, h)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())?;

    {
        let st = app.state::<AppState>();
        let mut guard = st.scroll.lock().expect("scroll mutex poisoned");
        // Authoritative guard against a double-start race: the fast-path check
        // above released the lock across the overlay-hide and first-frame
        // capture, so re-check here while still holding the lock through the
        // insert. A second concurrent start that slipped past the fast path
        // loses here and bails — no clobbered session, no second sampler.
        if guard.is_some() {
            return Err("scroll capture already in progress".into());
        }
        *guard = Some(ScrollSession {
            monitor_id,
            x,
            y,
            w,
            h,
            acc: first.clone(),
            prev: first,
            frames: 1,
            warnings: 0,
        });
    }

    // Destroy the full-screen selection overlays; show the compact HUD instead.
    windows::close_overlays(&app);

    // Window creation + AppKit (`NSWindow`) calls MUST run on the main thread on
    // macOS — building the HUD off-thread aborts the process. Hop to the main
    // thread and ferry the result back (mirrors how overlays are created).
    let (tx, rx) = std::sync::mpsc::channel();
    let app_main = app.clone();
    app.run_on_main_thread(move || {
        let res =
            windows::show_scroll_hud(&app_main, monitor_id, x, y, w, h).map_err(|e| e.to_string());
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;
    let hud_res = rx.recv().map_err(|e| format!("hud channel: {e}"))?;
    if let Err(e) = hud_res {
        // If the HUD can't open, abort cleanly rather than leaving a headless
        // session running with no way to finish it.
        {
            let st = app.state::<AppState>();
            let _ = st.scroll.lock().expect("scroll mutex poisoned").take();
        }
        windows::show_editor_if_hidden(&app);
        return Err(format!("show scroll HUD: {e}"));
    }

    spawn_sampler(app);
    Ok(())
}

/// Background loop: re-capture the region, stitch, emit progress. Exits as soon
/// as the session is taken out of state (finish/cancel).
fn spawn_sampler<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(SAMPLE_INTERVAL_MS)).await;

            // Snapshot the region; stop if the session ended.
            let region = {
                let st = app.state::<AppState>();
                let g = st.scroll.lock().expect("scroll mutex poisoned");
                match g.as_ref() {
                    Some(s) => (s.monitor_id, s.x, s.y, s.w, s.h),
                    None => break,
                }
            };
            let (mid, x, y, w, h) = region;

            // Capture outside the lock — this is the slow part (~tens of ms).
            let frame =
                match tokio::task::spawn_blocking(move || capture_service::capture_region(mid, x, y, w, h))
                    .await
                {
                    Ok(Ok(f)) => f,
                    Ok(Err(e)) => {
                        log::warn!("scroll sample capture: {e}");
                        continue;
                    }
                    Err(e) => {
                        log::warn!("scroll sample join: {e}");
                        continue;
                    }
                };

            let progress = {
                let st = app.state::<AppState>();
                let mut g = st.scroll.lock().expect("scroll mutex poisoned");
                let Some(s) = g.as_mut() else { break };
                let out = stitch::append_frame(&mut s.acc, &s.prev, &frame, EXCLUDE_BAND);
                if !out.duplicate {
                    s.prev = frame;
                    s.frames += 1;
                    if out.low_confidence {
                        s.warnings += 1;
                    }
                }
                ScrollProgress {
                    frames: s.frames,
                    height: s.acc.height(),
                    warnings: s.warnings,
                }
            };

            if let Err(e) = app.emit_to("scroll-hud", "scroll://progress", progress) {
                log::warn!("emit scroll://progress: {e}");
            }
        }
    });
}

/// Finish the capture: stop sampling, encode the stitched image, open it in the
/// editor exactly like any other capture.
#[tauri::command]
pub async fn scroll_capture_finish_command<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let session = {
        let st = app.state::<AppState>();
        let mut guard = st.scroll.lock().expect("scroll mutex poisoned");
        guard.take()
    };
    windows::close_scroll_hud(&app);
    let Some(session) = session else {
        return Err("no scroll capture in progress".into());
    };
    let acc = session.acc;
    // Reuse the standard encode + open-in-editor tail (honors intermediate
    // format + max-edge downscale from settings).
    crate::commands::capture::capture_to_editor(app, "scroll_finish".into(), move || Ok(acc)).await
}

/// Cancel the capture: stop sampling, discard everything, write no temp file.
#[tauri::command]
pub fn scroll_capture_cancel_command<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    {
        let st = app.state::<AppState>();
        let _ = st.scroll.lock().expect("scroll mutex poisoned").take();
    }
    windows::close_scroll_hud(&app);
    windows::show_editor_if_hidden(&app);
    Ok(())
}
