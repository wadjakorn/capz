use anyhow::{anyhow, Result};
use serde::Serialize;
use xcap::Monitor;

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub is_primary: bool,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn list_monitors() -> Result<Vec<MonitorInfo>> {
    let mons = Monitor::all().map_err(|e| anyhow!("Monitor::all failed: {e}"))?;
    let mut out = Vec::with_capacity(mons.len());
    for m in mons {
        out.push(MonitorInfo {
            id: m.id().map_err(|e| anyhow!("id: {e}"))?,
            name: m.name().map_err(|e| anyhow!("name: {e}"))?,
            x: m.x().map_err(|e| anyhow!("x: {e}"))?,
            y: m.y().map_err(|e| anyhow!("y: {e}"))?,
            width: m.width().map_err(|e| anyhow!("width: {e}"))?,
            height: m.height().map_err(|e| anyhow!("height: {e}"))?,
            scale_factor: m.scale_factor().map_err(|e| anyhow!("scale: {e}"))?,
            is_primary: m.is_primary().map_err(|e| anyhow!("primary: {e}"))?,
        });
    }
    Ok(out)
}

pub fn monitor_by_id(id: u32) -> Result<Monitor> {
    let mons = Monitor::all().map_err(|e| anyhow!("Monitor::all failed: {e}"))?;
    for m in mons {
        if m.id().map_err(|e| anyhow!("id: {e}"))? == id {
            return Ok(m);
        }
    }
    Err(anyhow!("monitor id {id} not found"))
}

pub fn primary_monitor() -> Result<Monitor> {
    let mons = Monitor::all().map_err(|e| anyhow!("Monitor::all failed: {e}"))?;
    for m in &mons {
        if m.is_primary().map_err(|e| anyhow!("primary: {e}"))? {
            return Ok(m.clone());
        }
    }
    mons.into_iter()
        .next()
        .ok_or_else(|| anyhow!("no monitors"))
}

/// Current cursor position in the SAME coordinate space `list_monitors` reports
/// monitor rects in: logical CG points on macOS, physical pixels on Windows.
/// Returns `None` when no platform cursor API is available (e.g. Linux dev
/// builds) — callers fall back to the primary monitor.
pub fn cursor_position() -> Option<(f64, f64)> {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: reads NSEvent/NSScreen via msg_send; all objects are borrowed,
        // never released, and we null-check `screens` before use.
        unsafe { cursor_point_macos() }
    }
    #[cfg(target_os = "windows")]
    {
        cursor_point_windows()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

/// Read the cursor and convert to CG top-left coords (matching xcap monitor
/// x/y). Returns `None` on failure.
#[cfg(target_os = "macos")]
unsafe fn cursor_point_macos() -> Option<(f64, f64)> {
    use objc2::{class, msg_send, runtime::AnyObject};
    use objc2_foundation::{NSPoint, NSRect};
    let pt: NSPoint = msg_send![class!(NSEvent), mouseLocation];
    let screens: *mut AnyObject = msg_send![class!(NSScreen), screens];
    if screens.is_null() {
        return None;
    }
    let count: usize = msg_send![screens, count];
    if count == 0 {
        return None;
    }
    let primary: *mut AnyObject = msg_send![screens, objectAtIndex: 0usize];
    let frame: NSRect = msg_send![primary, frame];
    let h_primary = frame.size.height;
    // NSEvent::mouseLocation is bottom-left origin; flip to top-left to match
    // xcap's monitor rects.
    Some((pt.x, h_primary - pt.y))
}

/// Read the cursor via Win32 `GetCursorPos` (physical px in the virtual desktop,
/// matching xcap's Windows monitor rects). Returns `None` if the call fails.
#[cfg(target_os = "windows")]
fn cursor_point_windows() -> Option<(f64, f64)> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut pt = POINT { x: 0, y: 0 };
    // SAFETY: GetCursorPos writes two i32 into our stack POINT and returns
    // nonzero on success.
    let ok = unsafe { GetCursorPos(&mut pt) };
    if ok == 0 {
        return None;
    }
    Some((pt.x as f64, pt.y as f64))
}

/// Pick which monitor a cursor point falls on. Pure so it is unit-testable.
/// Returns the id of the monitor whose rect contains `cursor`; if the cursor is
/// unknown or outside every monitor, falls back to the primary monitor, then the
/// first. `None` only when `mons` is empty.
pub fn select_monitor_at(cursor: Option<(f64, f64)>, mons: &[MonitorInfo]) -> Option<u32> {
    if let Some((cx, cy)) = cursor {
        if let Some(m) = mons.iter().find(|m| {
            cx >= m.x as f64
                && cx < (m.x + m.width as i32) as f64
                && cy >= m.y as f64
                && cy < (m.y + m.height as i32) as f64
        }) {
            return Some(m.id);
        }
    }
    mons.iter()
        .find(|m| m.is_primary)
        .or_else(|| mons.first())
        .map(|m| m.id)
}

/// Id of the monitor under the cursor, resolved entirely without showing a
/// window. Guaranteed to return a monitor when any exist (falls back to
/// primary/first); `Err` only when the system reports no monitors at all.
pub fn monitor_under_cursor() -> Result<u32> {
    let mons = list_monitors()?;
    select_monitor_at(cursor_position(), &mons).ok_or_else(|| anyhow!("no monitors"))
}

#[allow(dead_code)]
pub fn virtual_desktop_bounds() -> Result<Rect> {
    let mons = list_monitors()?;
    if mons.is_empty() {
        return Err(anyhow!("no monitors"));
    }
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    for m in &mons {
        min_x = min_x.min(m.x);
        min_y = min_y.min(m.y);
        max_x = max_x.max(m.x + m.width as i32);
        max_y = max_y.max(m.y + m.height as i32);
    }
    Ok(Rect {
        x: min_x,
        y: min_y,
        width: (max_x - min_x) as u32,
        height: (max_y - min_y) as u32,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(id: u32, x: i32, y: i32, w: u32, h: u32, primary: bool) -> MonitorInfo {
        MonitorInfo {
            id,
            name: format!("mon-{id}"),
            x,
            y,
            width: w,
            height: h,
            scale_factor: 1.0,
            is_primary: primary,
        }
    }

    fn two_monitors() -> Vec<MonitorInfo> {
        // Primary on the left at origin; secondary to its right, negative-free.
        vec![
            mon(1, 0, 0, 1440, 900, true),
            mon(2, 1440, 0, 1920, 1080, false),
        ]
    }

    #[test]
    fn cursor_inside_a_monitor_selects_it() {
        let mons = two_monitors();
        assert_eq!(select_monitor_at(Some((100.0, 100.0)), &mons), Some(1));
        assert_eq!(select_monitor_at(Some((2000.0, 500.0)), &mons), Some(2));
    }

    #[test]
    fn boundary_is_half_open_right_edge_belongs_to_next() {
        let mons = two_monitors();
        // x == 1440 is the left edge of monitor 2 (inclusive), not the right edge
        // of monitor 1 (exclusive).
        assert_eq!(select_monitor_at(Some((1440.0, 10.0)), &mons), Some(2));
        // x == 1439 is still inside monitor 1.
        assert_eq!(select_monitor_at(Some((1439.0, 10.0)), &mons), Some(1));
    }

    #[test]
    fn cursor_outside_all_monitors_falls_back_to_primary() {
        let mons = two_monitors();
        // Below every monitor.
        assert_eq!(select_monitor_at(Some((100.0, 5000.0)), &mons), Some(1));
    }

    #[test]
    fn unknown_cursor_falls_back_to_primary() {
        let mons = two_monitors();
        assert_eq!(select_monitor_at(None, &mons), Some(1));
    }

    #[test]
    fn no_primary_falls_back_to_first() {
        let mons = vec![mon(7, 0, 0, 800, 600, false), mon(9, 800, 0, 800, 600, false)];
        assert_eq!(select_monitor_at(None, &mons), Some(7));
    }

    #[test]
    fn negative_origin_secondary_is_handled() {
        // Secondary display to the left with a negative origin (normal setup).
        let mons = vec![
            mon(1, 0, 0, 1920, 1080, true),
            mon(2, -1440, -200, 1440, 900, false),
        ];
        assert_eq!(select_monitor_at(Some((-100.0, 100.0)), &mons), Some(2));
    }

    #[test]
    fn empty_monitor_list_is_none() {
        assert_eq!(select_monitor_at(Some((0.0, 0.0)), &[]), None);
        assert_eq!(select_monitor_at(None, &[]), None);
    }
}
