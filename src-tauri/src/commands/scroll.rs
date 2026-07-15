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

use crate::services::{capture_service, stitch, synthetic_scroll};
use crate::state::{AppState, ScrollSession};
use crate::windows;

/// How often the sampler re-captures the region while the user scrolls. Kept
/// short so that even a brisk scroll advances well under one viewport between
/// samples — this keeps the per-frame offset inside the stitcher's detectable
/// overlap range and reduces the chance of sampling a frame mid scroll-animation
/// (both of which otherwise force a low-confidence, duplicated seam).
const SAMPLE_INTERVAL_MS: u64 = 120;

/// Rows at the top and bottom of each frame ignored during seam matching so a
/// fixed toolbar/header doesn't pin the alignment. Physical pixels.
const EXCLUDE_BAND: u32 = 48;

/// Settle delay after posting an auto-scroll step, before grabbing the frame.
/// Longer than [`SAMPLE_INTERVAL_MS`] to let lazy-loaded content paint and any
/// scroll momentum settle so the captured frame is stable.
const AUTO_SETTLE_MS: u64 = 350;

/// New rows below this count as "no progress" for auto-scroll bottom detection.
/// A real step advances hundreds of rows, so this comfortably ignores a blinking
/// cursor / minor animation while still catching a page that has stopped moving.
const AUTO_MIN_PROGRESS_ROWS: u32 = 8;

/// Consecutive no-progress auto steps that mean the page won't move any further.
/// Interpreted as **bottom reached** once at least one *auto* step made progress,
/// or as **target ignores synthetic scroll** if auto-scroll never moved it.
const AUTO_NO_PROGRESS_STREAK: u32 = 3;

/// What the sampler should do after an auto-scroll step, given the running
/// no-progress `streak`, whether auto-scroll has advanced at all this session
/// (`auto_progressed`), and whether the Windows step-size ramp has been exhausted
/// (`ramp_exhausted` — a max-size step was already posted; see
/// [`next_auto_clicks`]). Pure so the decision is unit-tested (see tests below).
#[derive(Debug, PartialEq, Eq)]
enum AutoOutcome {
    /// Keep auto-scrolling.
    Continue,
    /// The page has stopped growing after real auto progress ⇒ end + encode.
    Bottomed,
    /// Auto-scroll never moved the target ⇒ hand back to manual scrolling.
    Fallback,
}

fn auto_outcome(streak: u32, auto_progressed: bool, ramp_exhausted: bool) -> AutoOutcome {
    if streak < AUTO_NO_PROGRESS_STREAK {
        AutoOutcome::Continue
    } else if auto_progressed {
        AutoOutcome::Bottomed
    } else if !ramp_exhausted {
        // Never moved yet, but we haven't tried the largest step. Keep going so
        // the ramp actually posts its max notch count before we conclude the
        // target ignores synthetic scroll (CP-0014 review) — otherwise a target
        // that only moves at a bigger step is wrongly abandoned. Bottom detection
        // (the `auto_progressed` arm above) is unaffected.
        AutoOutcome::Continue
    } else {
        AutoOutcome::Fallback
    }
}

/// Smallest and largest wheel-notch count a single Windows auto-scroll step may
/// request. The floor is one notch (never post zero — that moves nothing and
/// would stall bottom detection); the ceiling caps how far a "too small" step
/// can ramp up before it risks overshooting the stitcher's overlap window.
const AUTO_CLICKS_MIN: i32 = 1;
const AUTO_CLICKS_MAX: i32 = 4;

/// Advance fractions (of the viewport) that bound a healthy per-step scroll.
/// Below [`AUTO_ADVANCE_LOW`] the step barely moved — push harder next time.
/// Above [`AUTO_ADVANCE_HIGH`] it's nearing the point where the stitcher can no
/// longer find overlap (it searches up to ~7/8 of a viewport) — back off. macOS
/// aims for 0.6 of a viewport, so this band brackets that same sweet spot.
const AUTO_ADVANCE_LOW: f32 = 0.25;
const AUTO_ADVANCE_HIGH: f32 = 0.70;

/// Adaptive Windows wheel-click controller (CP-0014). Given the count used for
/// the step that just ran, how many rows it actually advanced (`appended`; 0 on
/// a duplicate/no-move) and the viewport height, return the notch count for the
/// **next** step.
///
/// A fixed count overshoots on targets that map each notch to a large jump, so
/// we steer toward a sub-viewport advance judged purely by the fraction advanced:
/// - **Shrink** above [`AUTO_ADVANCE_HIGH`]. A butt-join (no overlap found —
///   content was skipped) always lands here: it appends nearly the whole frame
///   (the fixed footer is clamped to ≤ ¼ of the frame, so the append is ≥ ¾ of a
///   viewport), as does a genuine confident scroll that jumped too far.
/// - **Grow** below [`AUTO_ADVANCE_LOW`] — the step barely moved (or a no-move
///   duplicate), so a long page isn't captured one hairline at a time.
/// - **Hold** in the healthy band.
///
/// Crucially, low seam *confidence* is NOT treated as an overshoot: a plausible
/// (noisy / fractional-DPI) overlap still aligned correctly and appended only the
/// real new rows, so it's judged by its advance like any other — otherwise a
/// small-but-valid noisy step would be stuck at one notch and crawl. Pure so the
/// policy is unit-tested (see tests).
///
/// Only consulted on Windows; macOS ignores the click count (exact pixel step).
fn next_auto_clicks(current: i32, appended: u32, viewport_h: u32) -> i32 {
    let frac = appended as f32 / viewport_h.max(1) as f32;
    if frac > AUTO_ADVANCE_HIGH {
        // Overshot (butt-join or a jump past the stitcher's overlap window) —
        // take a smaller bite next time.
        (current - 1).max(AUTO_CLICKS_MIN)
    } else if frac < AUTO_ADVANCE_LOW {
        // Barely moved (or a target that eats a single notch) — push harder so a
        // long page isn't captured one hairline at a time.
        (current + 1).min(AUTO_CLICKS_MAX)
    } else {
        current
    }
}

/// Live progress pushed to the HUD after each sample.
#[derive(Clone, serde::Serialize)]
struct ScrollProgress {
    /// Distinct frames stitched so far.
    frames: u32,
    /// Current stitched image height in physical pixels.
    height: u32,
    /// Number of low-confidence seams so far (0 = clean).
    warnings: u32,
    /// Whether the backend is currently driving the scroll itself. The HUD
    /// mirrors this to switch between manual and auto controls.
    auto: bool,
    /// Set on the final emit once the backend has begun auto-finishing (bottom
    /// reached): the HUD shows its "Processing capture…" spinner.
    finishing: bool,
    /// Transient one-line status for the HUD (e.g. an auto-scroll fell back to
    /// manual). `None` on ordinary ticks.
    note: Option<String>,
}

impl ScrollProgress {
    fn from_session(s: &ScrollSession) -> Self {
        ScrollProgress {
            frames: s.frames,
            height: s.acc.height(),
            warnings: s.warnings,
            auto: s.auto,
            finishing: false,
            note: None,
        }
    }
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
    auto: Option<bool>,
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
        *guard = Some(ScrollSession::new(monitor_id, x, y, w, h, first, auto.unwrap_or(false)));
    }

    // Destroy the full-screen selection overlays; show the compact HUD instead.
    windows::close_overlays(&app);

    // Window creation + AppKit (`NSWindow`) calls MUST run on the main thread on
    // macOS — building the HUD off-thread aborts the process. Hop to the main
    // thread and ferry the result back (mirrors how overlays are created).
    let (tx, rx) = std::sync::mpsc::channel();
    let app_main = app.clone();
    app.run_on_main_thread(move || {
        let res = windows::show_scroll_hud(&app_main, monitor_id, x, y, w, h, auto.unwrap_or(false))
            .map_err(|e| e.to_string());
        // The region outline is a non-critical visual aid; only bother once the
        // HUD (the actual control) is up — otherwise an aborting capture would
        // spawn and immediately tear down a full transparent window. If it fails
        // the HUD still drives the capture, so just log and carry on.
        if res.is_ok() {
            if let Err(e) = windows::show_scroll_guide(&app_main, monitor_id, x, y, w, h) {
                log::warn!("show scroll guide: {e}");
            }
            // Re-assert HUD focus: the guide is focused(false) + click-through,
            // but showing an always-on-top window can still steal activation on
            // Windows, and Enter/Esc (finish/cancel) must reach the HUD.
            if let Some(hud) = app_main.get_webview_window(windows::SCROLL_HUD_LABEL) {
                let _ = hud.set_focus();
            }
        }
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
        windows::close_scroll_guide(&app);
        windows::show_editor_if_hidden(&app);
        return Err(format!("show scroll HUD: {e}"));
    }

    spawn_sampler(app);
    Ok(())
}

/// Push a progress frame to the HUD.
fn emit_progress<R: Runtime>(app: &AppHandle<R>, progress: ScrollProgress) {
    if let Err(e) = app.emit_to("scroll-hud", "scroll://progress", progress) {
        log::warn!("emit scroll://progress: {e}");
    }
}

/// Background loop: re-capture the region, stitch, emit progress. Exits as soon
/// as the session is taken out of state (finish/cancel).
///
/// When the session's `auto` flag is set the loop also *drives* the target: each
/// tick posts a synthetic scroll step, waits [`AUTO_SETTLE_MS`] for the page to
/// settle, then captures + stitches. It stops the moment the page stops growing:
/// after progress, a run of no-progress steps means the bottom is reached, so it
/// auto-finishes (encode + open editor) with zero further user effort. If the
/// target ignores synthetic scroll (never moved) or events can't be posted, it
/// clears `auto` and reverts to manual so the user can finish by hand.
fn spawn_sampler<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        loop {
            // Snapshot the region + whether we're auto-driving this tick + the
            // adapted per-step wheel-click count (Windows; ignored on macOS).
            let (region, auto, clicks) = {
                let st = app.state::<AppState>();
                let g = st.scroll.lock().expect("scroll mutex poisoned");
                match g.as_ref() {
                    Some(s) => ((s.monitor_id, s.x, s.y, s.w, s.h), s.auto, s.auto_clicks),
                    None => break,
                }
            };
            let (mid, x, y, w, h) = region;

            if auto {
                // Drive one step, then let it settle before the grab. If events
                // can't be posted (no Accessibility grant on macOS, unsupported
                // platform, injection failure) fall back to manual: clear `auto`,
                // tell the HUD, keep sampling so the user can finish by hand.
                if let Err(e) = synthetic_scroll::scroll_step(mid, x, y, w, h, clicks) {
                    log::warn!("auto-scroll step: {e}");
                    let st = app.state::<AppState>();
                    let mut g = st.scroll.lock().expect("scroll mutex poisoned");
                    let Some(s) = g.as_mut() else { break };
                    s.auto = false;
                    s.dup_streak = 0;
                    let mut progress = ScrollProgress::from_session(s);
                    progress.note = Some("Auto-scroll unavailable — scroll manually".into());
                    drop(g);
                    emit_progress(&app, progress);
                    continue;
                }
                tokio::time::sleep(std::time::Duration::from_millis(AUTO_SETTLE_MS)).await;
            } else {
                tokio::time::sleep(std::time::Duration::from_millis(SAMPLE_INTERVAL_MS)).await;
            }

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

            // Stitch + decide under the lock, then release it before any await.
            // `bottomed` (auto only) means the page won't grow further: we take
            // the session here so the loop stops and the encode owns a stable
            // image. The lock (and the borrowed `State`) must not straddle the
            // finish `.await`, so everything below runs inside this block.
            let (progress, finish_acc) = {
                let st = app.state::<AppState>();
                let mut guard = st.scroll.lock().expect("scroll mutex poisoned");
                let Some(s) = guard.as_mut() else { break };
                // Measure + apply this frame (locking the fixed footer on the first
                // real scroll). Shared with the finish path so a late-revealed
                // frame stitches identically — see `stitch_frame`.
                let out = stitch_frame(s, frame);
                let progressed = !out.duplicate && out.appended >= AUTO_MIN_PROGRESS_ROWS;
                let mut note: Option<String> = None;
                let mut bottomed = false;
                if s.auto {
                    // The count that *this* step actually posted (before we adapt
                    // it below). Once a max-size step has been posted with no
                    // progress, the ramp is exhausted and fallback may fire.
                    let ramp_exhausted = s.auto_clicks >= AUTO_CLICKS_MAX;
                    // Adapt the Windows wheel-click count from what this step
                    // actually advanced, so the next step lands inside the
                    // stitcher's overlap window (CP-0014). No-op on macOS, which
                    // ignores the count and steps an exact pixel fraction.
                    s.auto_clicks = next_auto_clicks(s.auto_clicks, out.appended, s.h);
                    if progressed {
                        s.dup_streak = 0;
                        // Record that auto-scroll (not an earlier manual scroll)
                        // actually advanced the page — this is what separates
                        // "bottom reached" from "target ignored the wheel".
                        s.auto_progressed = true;
                    } else {
                        s.dup_streak += 1;
                    }
                    match auto_outcome(s.dup_streak, s.auto_progressed, ramp_exhausted) {
                        AutoOutcome::Continue => {}
                        AutoOutcome::Bottomed => bottomed = true,
                        AutoOutcome::Fallback => {
                            s.auto = false;
                            s.dup_streak = 0;
                            s.auto_progressed = false;
                            note = Some("Target ignored auto-scroll — scroll manually".into());
                        }
                    }
                }
                let mut progress = ScrollProgress::from_session(s);
                progress.note = note;
                progress.finishing = bottomed;
                let finish_acc = if bottomed { guard.take().map(finalize_capture) } else { None };
                (progress, finish_acc)
            };

            emit_progress(&app, progress);
            if let Some((acc, footer_handled)) = finish_acc {
                // Spinner (emitted above with finishing=true) first, then the
                // slow encode + open — the session is already out, so there's no
                // double-finish race with the manual Capture button.
                if let Err(e) = finish_open(&app, acc, footer_handled).await {
                    log::warn!("auto-scroll finish: {e}");
                }
                break;
            }
        }
    });
}

/// Turn on auto-scroll for the in-flight capture. The running sampler picks this
/// up on its next tick and starts driving the target. Returns an error (which
/// the HUD surfaces) if no capture is in progress.
#[tauri::command]
pub fn scroll_capture_auto_start_command<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let st = app.state::<AppState>();
    let mut g = st.scroll.lock().expect("scroll mutex poisoned");
    let Some(s) = g.as_mut() else {
        return Err("no scroll capture in progress".into());
    };
    s.auto = true;
    s.dup_streak = 0;
    // Fresh auto session: no auto progress yet. Prevents manual frames captured
    // before this point from being counted as auto-scroll progress (which would
    // let an ignored-scroll target be mistaken for "bottom reached").
    s.auto_progressed = false;
    // Start the Windows step-size ramp from the smallest bite again, so a new
    // auto run can't inherit a large count from a previous one and overshoot.
    s.auto_clicks = 1;
    Ok(())
}

/// Stop auto-scroll and return to manual (user pressed Stop). The session stays
/// alive so the user can keep scrolling by hand and finish when ready.
#[tauri::command]
pub fn scroll_capture_auto_stop_command<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let st = app.state::<AppState>();
    let mut g = st.scroll.lock().expect("scroll mutex poisoned");
    if let Some(s) = g.as_mut() {
        s.auto = false;
        s.dup_streak = 0;
    }
    Ok(())
}

/// Shared finish tail: drop the region outline, encode the stitched image, open
/// it in the editor (honoring intermediate format + max-edge downscale), then
/// close the HUD. Used by both the manual Capture button and auto-scroll's
/// bottom-reached auto-finish.
///
/// The fixed window footer is now excluded during stitching (see the sampler),
/// so nothing to trim there.
///
/// `footer_handled` gates the legacy duplicate-trim. When a footer was
/// established, the fixed bottom band was excluded from every seam and
/// re-attached exactly once by `finalize_capture`, so the tail already ends
/// cleanly at the window edge — running `trim_trailing_duplicate` on top of that
/// only risks eating real bottom rows that happen to resemble the rows above
/// them (observed: the very bottom of short captures cut off). So the trim runs
/// ONLY on the older path where no footer was ever detected (the artifact it was
/// written for can still occur there).
async fn finish_open<R: Runtime>(
    app: &AppHandle<R>,
    mut acc: image::RgbaImage,
    footer_handled: bool,
) -> Result<String, String> {
    if !footer_handled {
        let dup = stitch::trim_trailing_duplicate(&mut acc);
        if dup > 0 {
            log::info!("scroll: trimmed {dup} duplicated trailing rows");
        }
    }
    // The region outline is only a live-capture aid — drop it as soon as we
    // commit, before the (potentially slow) encode.
    windows::close_scroll_guide(app);
    // Keep the HUD up (spinner + input block) through the encode, then close it
    // as the editor opens — closing it earlier tears the window down before the
    // "Processing capture…" spinner can paint.
    let res = crate::commands::capture::capture_to_editor(
        app.clone(),
        "scroll_finish".into(),
        windows::CaptureSource::Scroll,
        move || Ok(acc),
    )
    .await;
    windows::close_scroll_hud(app);
    if res.is_err() {
        // On success `capture_to_editor` shows the editor; on failure it does
        // not, and the session is already taken. Surface a window so the user
        // isn't left staring at nothing after a failed finish.
        windows::show_editor_if_hidden(app);
    }
    res
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
    let Some(mut session) = session else {
        // Nothing in flight — tear down whatever windows are up and report it.
        windows::close_scroll_guide(&app);
        windows::close_scroll_hud(&app);
        return Err("no scroll capture in progress".into());
    };
    // Grab one fresh frame and stitch it before finalizing. The background
    // sampler only samples every SAMPLE_INTERVAL_MS, so on a quick short scroll
    // the user often presses Capture before the final on-screen position was
    // ever sampled — without this grab that last-revealed bottom content is cut
    // off (the whole point of a short scroll is a small total, so a missed final
    // delta is a large fraction of it). A no-op Duplicate when nothing changed.
    let (mid, x, y, w, h) = (
        session.monitor_id,
        session.x,
        session.y,
        session.w,
        session.h,
    );
    match tokio::task::spawn_blocking(move || capture_service::capture_region(mid, x, y, w, h)).await
    {
        Ok(Ok(frame)) => {
            stitch_frame(&mut session, frame);
        }
        Ok(Err(e)) => log::warn!("scroll finish final grab: {e}"),
        Err(e) => log::warn!("scroll finish final grab join: {e}"),
    }
    let (acc, footer_handled) = finalize_capture(session);
    finish_open(&app, acc, footer_handled).await
}

/// Measure + apply one freshly captured `frame` onto the session accumulator,
/// locking the fixed-footer height on the first confident/plausible scroll.
/// Shared by the live sampler and the finish path (which grabs one last frame so
/// a quick short scroll's final on-screen content — revealed after the previous
/// ~[`SAMPLE_INTERVAL_MS`] sample — isn't cut off). Returns the append outcome;
/// updates `prev`/`frames`/`warnings` on a non-duplicate frame.
fn stitch_frame(s: &mut ScrollSession, frame: image::RgbaImage) -> stitch::StitchOutcome {
    // Measure the scroll first (no mutation). Exclude the known fixed footer
    // (plus the default band) from matching so window chrome doesn't bias the
    // offset.
    let exclude = EXCLUDE_BAND.max(s.footer.unwrap_or(0));
    let mut decision = stitch::measure_frame(&s.prev, &frame, exclude);
    // Lock the fixed-footer height on the FIRST confident/plausible scroll (not a
    // fling/butt-join, whose frames don't share a real static band). The footer
    // is the bottom band identical between these two consecutive frames — the
    // window chrome/scrollbar/border that never moves. Clamp it to a plausible
    // fraction of the frame so a bad measurement can never eat real content.
    //
    // The `acc.height() == frame_h` guard enforces the invariant the trim below
    // relies on: `acc` is still exactly the first frame. It holds when every
    // prior decision was a Duplicate (appends nothing); a butt-join before the
    // first real scroll (a fling from rest) would have grown `acc`, so we skip
    // footer detection in that rare case rather than trim the wrong rows.
    // Over-detection here is self-correcting anyway: content wrongly excluded is
    // re-revealed above the true chrome next frame (and the last band is
    // re-attached at finish), so nothing is dropped while the scroll step exceeds
    // the over-count.
    let frame_h = frame.height();
    if s.footer.is_none()
        && s.acc.height() == frame_h
        && matches!(decision, stitch::StitchDecision::Scroll { .. })
    {
        let f = stitch::static_bottom_rows(&s.prev, &frame).min(frame_h / 4);
        // `acc` is exactly the first frame here (guard above), so dropping its
        // bottom `f` rows removes the first frame's own footer band.
        stitch::trim_bottom_rows(&mut s.acc, f);
        s.footer = Some(f);
        // Re-measure with the now-known footer excluded for a clean first offset
        // (matters only when the footer exceeds the default band).
        decision = stitch::measure_frame(&s.prev, &frame, EXCLUDE_BAND.max(f));
    }
    let footer = s.footer.unwrap_or(0);
    let out = stitch::apply_frame(&mut s.acc, &frame, decision, footer);
    if !out.duplicate {
        s.prev = frame;
        s.frames += 1;
        if out.low_confidence {
            s.warnings += 1;
        }
    }
    out
}

/// Produce the final stitched image from a finished session: re-attach the fixed
/// window bottom edge (excluded from every seam during stitching) once at the
/// very bottom, so the capture ends at the natural window edge instead of a hard
/// mid-content cut. No-op when no footer was detected.
///
/// Returns `(image, footer_handled)`. `footer_handled` is true when a fixed
/// footer was established (the normal case): the bottom band was excluded from
/// every seam and re-attached exactly once here, so the tail is already clean and
/// the legacy duplicate-trim in `finish_open` must be skipped — see there.
fn finalize_capture(session: ScrollSession) -> (image::RgbaImage, bool) {
    let footer_handled = session.footer.is_some();
    let mut acc = session.acc;
    if let Some(footer) = session.footer {
        stitch::append_footer_band(&mut acc, &session.prev, footer);
    }
    (acc, footer_handled)
}

/// Cancel the capture: stop sampling, discard everything, write no temp file.
#[tauri::command]
pub fn scroll_capture_cancel_command<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    {
        let st = app.state::<AppState>();
        let _ = st.scroll.lock().expect("scroll mutex poisoned").take();
    }
    windows::close_scroll_guide(&app);
    windows::close_scroll_hud(&app);
    windows::show_editor_if_hidden(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        auto_outcome, finalize_capture, next_auto_clicks, stitch_frame, AutoOutcome,
        AUTO_CLICKS_MAX, AUTO_CLICKS_MIN, AUTO_NO_PROGRESS_STREAK,
    };
    use crate::state::ScrollSession;
    use image::{Rgba, RgbaImage};

    /// Deterministic, vertically-varied tall page so alignment is unambiguous.
    fn tall_page(w: u32, h: u32) -> RgbaImage {
        let mut img = RgbaImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let r = ((y * 7 + x * 3) % 256) as u8;
                let g = ((y * 13 + 40) % 256) as u8;
                let b = ((x * 5 + y) % 256) as u8;
                img.put_pixel(x, y, Rgba([r, g, b, 255]));
            }
        }
        img
    }

    #[test]
    fn new_session_seeds_auto_flag() {
        let first = tall_page(80, 120);
        let manual = ScrollSession::new(0, 0, 0, 80, 120, first.clone(), false);
        assert!(!manual.auto, "manual start must not be auto");
        assert_eq!(manual.frames, 1);
        assert_eq!(manual.acc.height(), 120);
        assert!(!manual.auto_progressed);

        let auto = ScrollSession::new(0, 0, 0, 80, 120, first, true);
        assert!(auto.auto, "auto start must seed auto = true");
        assert!(!auto.auto_progressed, "auto starts with no progress yet");
    }

    /// A capture frame at scroll offset `o`: the page content region [o, o+content)
    /// with a fixed `chrome`-row window band pasted over the bottom (identical in
    /// every frame — the footer the stitcher must exclude then re-attach once).
    fn framed(page: &RgbaImage, o: u32, content: u32, chrome: u32) -> RgbaImage {
        let w = page.width();
        let h = content + chrome;
        let mut f = RgbaImage::new(w, h);
        for y in 0..content {
            for x in 0..w {
                f.put_pixel(x, y, *page.get_pixel(x, o + y));
            }
        }
        let band = Rgba([222u8, 111, 55, 255]);
        for y in content..h {
            for x in 0..w {
                f.put_pixel(x, y, band);
            }
        }
        f
    }

    fn new_session(first: RgbaImage) -> ScrollSession {
        ScrollSession {
            monitor_id: 0,
            x: 0,
            y: 0,
            w: first.width(),
            h: first.height(),
            acc: first.clone(),
            prev: first,
            frames: 1,
            warnings: 0,
            auto: false,
            dup_streak: 0,
            auto_progressed: false,
            auto_clicks: 1,
            footer: None,
        }
    }

    /// The reported bug: on a quick short scroll the user presses Capture before
    /// the sampler recorded the final on-screen position, so the last-revealed
    /// bottom content is cut off. Finishing must stitch a fresh frame first. This
    /// exercises the real `stitch_frame` + `finalize_capture` used on finish.
    #[test]
    fn finish_grab_recovers_the_unsampled_bottom() {
        let (w, content, chrome) = (120u32, 300u32, 24u32);
        let page = tall_page(w, 520);
        let bottom_o = 520 - content; // 220: fully scrolled
        let sampled = [0u32, 90, 180]; // the sampler stopped one delta short of bottom
        let frame_at = |o: u32| framed(&page, o, content, chrome);

        // Without the finish grab: finalize the last SAMPLED state (offset 180).
        let mut without = new_session(frame_at(sampled[0]));
        for &o in &sampled[1..] {
            stitch_frame(&mut without, frame_at(o));
        }
        let (img_without, _) = finalize_capture(without);

        // With the finish grab: the same samples, then one fresh frame at the true
        // bottom (what `scroll_capture_finish_command` now captures on finish).
        let mut with = new_session(frame_at(sampled[0]));
        for &o in &sampled[1..] {
            stitch_frame(&mut with, frame_at(o));
        }
        stitch_frame(&mut with, frame_at(bottom_o));
        let (img_with, footer_handled) = finalize_capture(with);
        assert!(footer_handled, "a real scroll must establish the footer");

        // The finish grab adds the missing rows, ending at a taller image.
        assert!(
            img_with.height() > img_without.height(),
            "finish grab must add the unsampled bottom rows ({} !> {})",
            img_with.height(),
            img_without.height()
        );

        // The very bottom of the fixed run of page content (row bottom_o+content-1,
        // just above the chrome band) must be present pixel-exact in the fixed
        // capture and absent from the truncated one.
        let last_content_row = bottom_o + content - 1;
        let img_h = img_with.height();
        // Row directly above the re-attached chrome band == the page's bottom line.
        let recovered = img_h - chrome - 1;
        for x in 0..w {
            assert_eq!(
                img_with.get_pixel(x, recovered),
                page.get_pixel(x, last_content_row),
                "bottom page row missing after finish grab at x={x}"
            );
        }
        // The truncated capture never reached that page row.
        assert!(
            img_without.height() - chrome - 1 < recovered,
            "truncated capture unexpectedly already contained the bottom"
        );
    }

    /// The residual bottom cut: after `finalize_capture` re-attaches the footer
    /// band, the tail is provably the final frame's true bottom. The legacy
    /// `trim_trailing_duplicate` in `finish_open` is the only thing that runs
    /// after — and on content whose bottom band structurally resembles the rows
    /// above (a table/list/repeated UI, common on short pages) it eats real
    /// bottom rows. This proves the hazard, so the fix gates that trim off
    /// whenever a footer was handled (`finalize_capture` reports it).
    #[test]
    fn dup_trim_would_eat_a_structured_near_duplicate_bottom() {
        // A short capture whose last band closely repeats the band above it.
        let (w, band) = (120u32, 60u32);
        let mut acc = tall_page(w, 240);
        // Overwrite the bottom `band` rows with a near-copy of the `band` above.
        for i in 0..band {
            for x in 0..w {
                let src = *acc.get_pixel(x, 240 - 2 * band + i);
                acc.put_pixel(x, 240 - band + i, src);
            }
        }
        let before = acc.height();
        // The un-gated legacy trim removes the bottom band — i.e., cuts content.
        let cut = crate::services::stitch::trim_trailing_duplicate(&mut acc);
        assert!(cut > 0, "trim is expected to eat this structured bottom band");
        assert!(acc.height() < before, "…which shortens the capture");
        // Our fix: when a footer was handled we skip that trim entirely, so a
        // finished capture keeps its full re-attached bottom. (Gate lives in
        // `finish_open`; `finalize_capture` reports `footer_handled`.)
    }

    /// A fresh finish frame identical to the last sample (user paused at the
    /// bottom, already sampled) is a no-op — no phantom rows, no growth.
    #[test]
    fn finish_grab_is_a_noop_when_nothing_new() {
        let (w, content, chrome) = (120u32, 300u32, 24u32);
        let page = tall_page(w, 520);
        let frame_at = |o: u32| framed(&page, o, content, chrome);

        let mut s = new_session(frame_at(0));
        stitch_frame(&mut s, frame_at(90));
        let before = s.acc.height();
        // Re-grab the exact same on-screen frame as the last sample.
        let out = stitch_frame(&mut s, frame_at(90));
        assert!(out.duplicate, "unchanged finish frame must dedup");
        assert_eq!(out.appended, 0);
        assert_eq!(s.acc.height(), before, "no-op finish grab must not grow acc");
    }

    /// CP-0008: an upward scroll mid-capture (the user scrolls back up) must be
    /// ignored at the session level — it grows neither the accumulator nor the
    /// seam-warning count, and leaves `prev` at the bottom-most position so a
    /// resumed downward scroll appends cleanly with no duplicated band.
    #[test]
    fn upward_frame_does_not_grow_acc_or_warn() {
        // Aperiodic page (each row a distinct hashed gray) so up-vs-down is
        // unambiguous — the mod-256-periodic `tall_page` would alias a downward
        // offset onto the upward one (see the stitch.rs counterpart). Plain
        // content (no fixed chrome band): an upward frame then has NO downward
        // reading at all, which is what the stitcher requires before it will
        // ignore a frame as an upward re-show (a plausible downward reading is
        // always appended, never dropped — CP-0008 review).
        let (w, vh) = (120u32, 300u32);
        let mut page = RgbaImage::new(w, 900);
        for y in 0..900u32 {
            let mut v = y.wrapping_add(1).wrapping_mul(2_654_435_761);
            v ^= v >> 15;
            v = v.wrapping_mul(2_246_822_519);
            v ^= v >> 13;
            let g = (v & 0xff) as u8;
            for x in 0..w {
                page.put_pixel(x, y, Rgba([g, g, g, 255]));
            }
        }
        let frame_at = |o: u32| image::imageops::crop_imm(&page, 0, o, w, vh).to_image();

        let mut s = new_session(frame_at(0));
        stitch_frame(&mut s, frame_at(90)); // down
        stitch_frame(&mut s, frame_at(180)); // down
        let after_down = s.acc.height();
        assert_eq!(s.warnings, 0, "clean downward scroll must not warn");

        // Scroll back up to an already-captured position.
        let up = stitch_frame(&mut s, frame_at(90));
        assert!(up.duplicate, "upward frame must be ignored");
        assert_eq!(up.appended, 0);
        assert_eq!(s.warnings, 0, "upward frame must not increment the seam count");
        assert_eq!(s.acc.height(), after_down, "upward frame must not grow the capture");

        // Resume downward past the previous bottom — appends only the new rows.
        let resume = stitch_frame(&mut s, frame_at(270));
        assert!(!resume.duplicate, "resumed downward scroll must append");
        assert_eq!(resume.appended, 90, "must append only the newly-revealed rows");
        assert_eq!(s.warnings, 0, "resumed clean scroll must still not warn");
        assert_eq!(s.acc.height(), after_down + 90);
    }

    #[test]
    fn keeps_scrolling_below_the_streak_threshold() {
        // Below the streak the ramp state is irrelevant — always Continue.
        assert_eq!(auto_outcome(0, false, false), AutoOutcome::Continue);
        assert_eq!(auto_outcome(0, false, true), AutoOutcome::Continue);
        assert_eq!(auto_outcome(0, true, true), AutoOutcome::Continue);
        assert_eq!(
            auto_outcome(AUTO_NO_PROGRESS_STREAK - 1, true, true),
            AutoOutcome::Continue
        );
    }

    #[test]
    fn bottoms_out_only_after_auto_scroll_advanced() {
        // Bottom detection fires on a stalled streak once auto progressed,
        // regardless of the ramp state (the step size doesn't matter at the end).
        assert_eq!(
            auto_outcome(AUTO_NO_PROGRESS_STREAK, true, false),
            AutoOutcome::Bottomed
        );
        assert_eq!(
            auto_outcome(AUTO_NO_PROGRESS_STREAK + 5, true, true),
            AutoOutcome::Bottomed
        );
    }

    #[test]
    fn falls_back_only_once_the_ramp_is_exhausted() {
        // The regression this guards: the user scrolled manually first (so the
        // session already has several frames), then enabled auto-scroll on a
        // target that ignores synthetic wheel. `auto_progressed` is false, so a
        // stalled streak must hand back to manual — NOT declare "bottom reached"
        // and finish a truncated capture. But only *after* the step-size ramp has
        // posted its max notch count (CP-0014 review): a stalled streak while the
        // ramp still has a bigger step to try must keep going, so a target that
        // only moves at a larger step isn't abandoned prematurely.
        assert_eq!(
            auto_outcome(AUTO_NO_PROGRESS_STREAK, false, false),
            AutoOutcome::Continue,
            "must keep ramping the step size before giving up"
        );
        assert_eq!(
            auto_outcome(AUTO_NO_PROGRESS_STREAK, false, true),
            AutoOutcome::Fallback
        );
        assert_eq!(
            auto_outcome(AUTO_NO_PROGRESS_STREAK + 2, false, true),
            AutoOutcome::Fallback
        );
    }

    // ---- next_auto_clicks (CP-0014 Windows step-size controller) ----

    #[test]
    fn overshoot_shrinks_the_click_count() {
        let vp = 1000u32;
        // A butt-join appends nearly the whole frame (footer clamped to ≤ ¼) —
        // frac ≥ 0.75, past the high-water mark, so back off.
        assert_eq!(next_auto_clicks(3, vp, vp), 2);
        // A confident scroll that jumped past 0.70 of a viewport also backs off.
        assert_eq!(next_auto_clicks(3, 800, vp), 2);
    }

    #[test]
    fn tiny_or_stalled_step_grows_the_click_count() {
        let vp = 1000u32;
        // Barely moved (< 0.25 viewport) — push harder.
        assert_eq!(next_auto_clicks(1, 100, vp), 2);
        // A no-move duplicate (0 rows) counts as too small: a target that eats a
        // single notch must be pushed past, not left stalling forever.
        assert_eq!(next_auto_clicks(1, 0, vp), 2);
    }

    /// Regression (codex review): a *plausible* low-confidence seam still aligned
    /// correctly and appended only the real new rows — it must be judged by its
    /// advance, not treated as an overshoot. A small such step (frac < 0.25) must
    /// GROW the click count, otherwise a noisy / fractional-DPI Windows target
    /// gets stuck at one notch and auto-scroll crawls or falls back.
    #[test]
    fn small_plausible_seam_grows_not_shrinks() {
        let vp = 1000u32;
        // 120 rows revealed on a plausible (low-confidence) overlap: frac 0.12.
        // Confidence is not an input any more — only the advance matters.
        assert_eq!(next_auto_clicks(1, 120, vp), 2);
        assert_eq!(next_auto_clicks(2, 120, vp), 3);
    }

    #[test]
    fn healthy_advance_holds_the_click_count() {
        let vp = 1000u32;
        // Inside the [0.25, 0.70] sweet spot: leave it be.
        assert_eq!(next_auto_clicks(2, 300, vp), 2);
        assert_eq!(next_auto_clicks(2, 600, vp), 2);
    }

    #[test]
    fn click_count_stays_within_bounds() {
        let vp = 1000u32;
        // Already at the floor: an overshoot can't push it below MIN.
        assert_eq!(next_auto_clicks(AUTO_CLICKS_MIN, vp, vp), AUTO_CLICKS_MIN);
        // Already at the ceiling: a tiny step can't push it above MAX.
        assert_eq!(next_auto_clicks(AUTO_CLICKS_MAX, 0, vp), AUTO_CLICKS_MAX);
    }

    #[test]
    fn zero_viewport_is_safe() {
        // Degenerate viewport must not divide by zero; a 0-row append reads as
        // "too small" and grows within bounds.
        assert_eq!(next_auto_clicks(1, 0, 0), 2);
    }
}
