//! Synthetic vertical-scroll driver for auto-scroll capture (ticket EJckEbEdk0ct).
//!
//! Posts a single downward scroll "step" to whatever window sits under a
//! capture region, so the auto-scroll sampler can advance a long page without
//! the user touching the wheel. The scroll-guide overlay is click-through
//! (`set_ignore_cursor_events(true)`, see `windows::show_scroll_guide`), so the
//! event lands on the target app beneath it.
//!
//! Region coordinates are **physical device pixels** relative to `monitor_id`'s
//! top-left — the same contract as `capture_service::capture_region`.
//!
//! Platform notes:
//! - **macOS:** `CGEventCreateScrollWheelEvent` + `CGEventPost`. Requires the
//!   Accessibility (TCC) grant — without it macOS silently drops the events and
//!   the page never moves, which the sampler detects as "no progress" and falls
//!   back to manual. Cursor is warped to the region centre first because the
//!   session tap delivers wheel events to the window under the pointer.
//! - **Windows:** `SetCursorPos` + `SendInput`/`MOUSEEVENTF_WHEEL`.
//! - **Linux/other:** unsupported — returns `Err`, and the caller falls back to
//!   manual scrolling.
//!
//! The step magnitude is deliberately kept under one viewport so consecutive
//! frames always overlap enough for `services::stitch` to align them.

/// Fraction of the region height to advance per step (macOS, where the pixel
/// unit lets us scroll an exact amount). Kept below 1.0 so successive frames
/// overlap — the stitcher needs shared rows to find the seam.
#[cfg(target_os = "macos")]
const STEP_FRACTION: f64 = 0.6;

/// Clamp for the per-step pixel amount (macOS): never crawl below this, never
/// jump more than this even on a very tall region.
#[cfg(target_os = "macos")]
const STEP_MIN_PX: f64 = 120.0;
#[cfg(target_os = "macos")]
const STEP_MAX_PX: f64 = 800.0;

/// Wheel "clicks" per step on Windows, where wheel deltas map to lines (not
/// pixels) and the exact pixel advance is app-defined. A few clicks reliably
/// advances a chunk while staying well under a normal viewport; if a target
/// scrolls more than a viewport per step the stitcher still butt-joins it (with
/// a low-confidence seam) rather than losing content.
#[cfg(target_os = "windows")]
const WHEEL_CLICKS: i32 = 3;

/// Post one downward scroll step over the given region. `Ok(())` means the
/// event was dispatched (it does **not** guarantee the target actually
/// scrolled — a target that ignores synthetic wheel, or a missing Accessibility
/// grant on macOS, both surface later as "no progress" in the sampler).
#[allow(unused_variables)]
pub fn scroll_step(monitor_id: u32, x: i32, y: i32, w: u32, h: u32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::scroll_step(monitor_id, x, y, w, h)
    }
    #[cfg(target_os = "windows")]
    {
        windows_impl::scroll_step(monitor_id, x, y, w, h)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("auto-scroll is not supported on this platform".into())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use crate::services::monitor_service;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    type CGEventRef = *mut std::ffi::c_void;
    type CGEventSourceRef = *const std::ffi::c_void;

    // `kCGScrollEventUnitPixel = 0` scrolls an exact pixel amount (no wheel
    // acceleration), which keeps the per-step advance predictable.
    const K_CG_SCROLL_EVENT_UNIT_PIXEL: u32 = 0;
    // `kCGSessionEventTap = 1`: inject at the session level so the event routes
    // to the app under the cursor, like a real wheel.
    const K_CG_SESSION_EVENT_TAP: u32 = 1;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWarpMouseCursorPosition(new_cursor_position: CGPoint) -> i32;
        // The C prototype is variadic (`wheel1[, wheel2, wheel3]`); declare it
        // variadic to match the ABI exactly and call it with only `wheel1`.
        fn CGEventCreateScrollWheelEvent(
            source: CGEventSourceRef,
            units: u32,
            wheel_count: u32,
            wheel1: i32,
            ...
        ) -> CGEventRef;
        fn CGEventPost(tap: u32, event: CGEventRef);
    }

    pub fn scroll_step(monitor_id: u32, x: i32, y: i32, w: u32, h: u32) -> Result<(), String> {
        let m = monitor_service::monitor_by_id(monitor_id).map_err(|e| e.to_string())?;
        // On macOS xcap monitor geometry is in logical points while the region
        // is physical px — divide the region offset by the scale to land the
        // cursor at the right logical point (mirrors `windows.rs`).
        let scale = m.scale_factor().map_err(|e| e.to_string())? as f64;
        let scale = if scale <= 0.0 { 1.0 } else { scale };
        let mx = m.x().map_err(|e| e.to_string())? as f64;
        let my = m.y().map_err(|e| e.to_string())? as f64;
        let cx = mx + (x as f64 + w as f64 / 2.0) / scale;
        let cy = my + (y as f64 + h as f64 / 2.0) / scale;

        // Advance ~60% of the (logical) viewport height, clamped. Negative
        // wheel1 scrolls the content downward (reveals rows below).
        let viewport_pts = h as f64 / scale;
        let step = (viewport_pts * super::STEP_FRACTION).clamp(super::STEP_MIN_PX, super::STEP_MAX_PX);
        let wheel1 = -(step.round() as i32);

        unsafe {
            // Park the pointer over the region so the session tap delivers the
            // wheel to the target window.
            let _ = CGWarpMouseCursorPosition(CGPoint { x: cx, y: cy });
            let event = CGEventCreateScrollWheelEvent(
                std::ptr::null(),
                K_CG_SCROLL_EVENT_UNIT_PIXEL,
                1,
                wheel1,
            );
            if event.is_null() {
                return Err("CGEventCreateScrollWheelEvent returned null".into());
            }
            CGEventPost(K_CG_SESSION_EVENT_TAP, event);
            // The Create* call follows the CoreFoundation create rule (retained);
            // release it so we don't leak one CGEvent per step.
            core_foundation_sys::base::CFRelease(event as *const std::ffi::c_void);
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use crate::services::monitor_service;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_WHEEL, MOUSEINPUT,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SetCursorPos;

    /// One notch of the wheel, per the Win32 `WHEEL_DELTA` contract.
    const WHEEL_DELTA: i32 = 120;

    pub fn scroll_step(monitor_id: u32, x: i32, y: i32, w: u32, h: u32) -> Result<(), String> {
        let m = monitor_service::monitor_by_id(monitor_id).map_err(|e| e.to_string())?;
        // On Windows both the monitor geometry and the region are physical px,
        // so the target point is a straight sum (no scale division).
        let mx = m.x().map_err(|e| e.to_string())?;
        let my = m.y().map_err(|e| e.to_string())?;
        let cx = mx + x + (w as i32) / 2;
        let cy = my + y + (h as i32) / 2;

        // Negative delta = wheel toward the user = scroll content downward.
        let delta = -(super::WHEEL_CLICKS * WHEEL_DELTA);

        unsafe {
            // Move the pointer over the region: Vista+ routes WM_MOUSEWHEEL to
            // the window under the cursor.
            if SetCursorPos(cx, cy) == 0 {
                return Err("SetCursorPos failed".into());
            }
            let input = INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx: 0,
                        dy: 0,
                        // `mouseData` carries the signed wheel delta; `as _` lets
                        // it coerce to whatever integer type windows-sys uses.
                        mouseData: delta as _,
                        dwFlags: MOUSEEVENTF_WHEEL,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
            let sent = SendInput(1, &input, std::mem::size_of::<INPUT>() as i32);
            if sent != 1 {
                return Err("SendInput failed to dispatch wheel event".into());
            }
        }
        Ok(())
    }
}
