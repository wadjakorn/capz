//! The capz editor as a window-mode capture target (WYSIWYG self-capture).
//!
//! Window mode normally skips every window owned by our process (overlays,
//! command ring, scroll HUD). The editor is the exception: when it is on screen
//! the user can point at it and capture it like any other app window.
//!
//! - macOS: xcap lists our windows, so the editor only needs to be let through
//!   the own-pid filter, matched by its CGWindowID (== `NSWindow.windowNumber`).
//! - Windows: xcap drops every window of the current process before we see it
//!   (it would deadlock in `GetWindowText`), so the editor entry is built here
//!   from its HWND + DWM frame bounds, and captured by cropping the monitor.
//!
//! The geometry/order rules are pure functions so they are unit-tested on any
//! platform; only the native lookups are `cfg`-gated.

use crate::commands::pickers::WindowOverlayInfo;

/// Physical-pixel screen rectangle, half-open: `[left, right) × [top, bottom)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScreenRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl ScreenRect {
    fn intersect(self, o: ScreenRect) -> Option<ScreenRect> {
        let r = ScreenRect {
            left: self.left.max(o.left),
            top: self.top.max(o.top),
            right: self.right.min(o.right),
            bottom: self.bottom.min(o.bottom),
        };
        (r.right > r.left && r.bottom > r.top).then_some(r)
    }
}

/// The on-screen editor, as seen by window mode.
#[derive(Debug, Clone)]
pub struct EditorTarget {
    /// Native window id in xcap's id space (CGWindowID / HWND as u32).
    pub id: u32,
    pub title: String,
    /// Visible frame in physical screen px (Windows: DWM extended frame
    /// bounds, i.e. without the invisible resize borders). Unused on macOS.
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    pub bounds: ScreenRect,
}

/// Window-mode filter: our own windows are skipped, except the editor when it
/// is a capture target.
pub fn include_window(pid: u32, id: u32, own_pid: u32, editor_id: Option<u32>) -> bool {
    pid != own_pid || editor_id == Some(id)
}

/// macOS hit-test order. `info` maps window id → (front-to-back rank, layer)
/// from one `CGWindowListCopyWindowInfo` snapshot. Keeps normal-layer (0)
/// windows plus the editor (which may float when pinned on top), dropping
/// other apps' floating overlays (window managers, border tools, meeting
/// HUDs) that would otherwise swallow every hover. Then orders front-to-back,
/// so whatever is visibly on top under the cursor wins. Windows missing from
/// the snapshot keep their place after the ranked ones.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn order_front_to_back(
    out: &mut Vec<WindowOverlayInfo>,
    info: &std::collections::HashMap<u32, (usize, i64)>,
    editor_id: Option<u32>,
) {
    out.retain(|w| match info.get(&w.id) {
        Some(&(_, layer)) => layer == 0 || editor_id == Some(w.id),
        None => true,
    });
    out.sort_by_key(|w| info.get(&w.id).map(|&(rank, _)| rank).unwrap_or(usize::MAX));
}

/// Windows: the editor's window-mode entry on monitor `mon` (physical px),
/// in monitor-local logical px (`div` = monitor scale), clipped to the monitor.
/// `None` when the editor is not on this monitor.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn editor_entry(editor: &EditorTarget, mon: ScreenRect, div: f32) -> Option<WindowOverlayInfo> {
    let r = editor.bounds.intersect(mon)?;
    let div = div.max(1.0);
    Some(WindowOverlayInfo {
        id: editor.id,
        title: editor.title.clone(),
        app_name: "capz".into(),
        x: ((r.left - mon.left) as f32 / div).round() as i32,
        y: ((r.top - mon.top) as f32 / div).round() as i32,
        width: (((r.right - r.left) as f32 / div).round() as u32).max(1),
        height: (((r.bottom - r.top) as f32 / div).round() as u32).max(1),
    })
}

/// Windows: where to crop the editor from. Picks the monitor holding the
/// largest share of the editor and returns `(monitor_id, x, y, w, h)` in that
/// monitor's local physical px, clipped to it — so `capture_region` never sees
/// a negative origin (which it would clamp without shrinking the size).
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn editor_crop(editor: ScreenRect, mons: &[(u32, ScreenRect)]) -> Option<(u32, i32, i32, u32, u32)> {
    mons.iter()
        .filter_map(|&(id, m)| editor.intersect(m).map(|r| (id, m, r)))
        .max_by_key(|(_, _, r)| (r.right - r.left) as i64 * (r.bottom - r.top) as i64)
        .map(|(id, m, r)| {
            (
                id,
                r.left - m.left,
                r.top - m.top,
                (r.right - r.left) as u32,
                (r.bottom - r.top) as u32,
            )
        })
}

/// The editor as a capture target, or `None` when it is hidden / minimized
/// (e.g. a capture started from the editor toolbar hid it first).
pub fn editor_target<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<EditorTarget> {
    use tauri::Manager;
    let win = app.get_webview_window("editor")?;
    if !win.is_visible().unwrap_or(false) || win.is_minimized().unwrap_or(false) {
        return None;
    }
    let title = win.title().unwrap_or_else(|_| "capz".into());
    native_target(app, &win, title)
}

#[cfg(target_os = "macos")]
fn native_target<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    win: &tauri::WebviewWindow<R>,
    title: String,
) -> Option<EditorTarget> {
    // AppKit is main-thread only: read `windowNumber` there.
    let (tx, rx) = std::sync::mpsc::channel();
    let w = win.clone();
    app.run_on_main_thread(move || {
        use objc2::{msg_send, runtime::AnyObject};
        let n = w.ns_window().ok().map(|p| {
            let ns_window = p as *mut AnyObject;
            let n: isize = unsafe { msg_send![ns_window, windowNumber] };
            n
        });
        let _ = tx.send(n);
    })
    .ok()?;
    let n = rx.recv_timeout(std::time::Duration::from_millis(500)).ok()??;
    (n > 0).then_some(EditorTarget {
        id: n as u32,
        title,
        bounds: ScreenRect { left: 0, top: 0, right: 0, bottom: 0 },
    })
}

#[cfg(target_os = "windows")]
fn native_target<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    win: &tauri::WebviewWindow<R>,
    title: String,
) -> Option<EditorTarget> {
    use windows_sys::Win32::Foundation::{HWND, RECT};
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    let hwnd = win.hwnd().ok()?.0 as HWND;
    let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
    // Extended frame bounds = the visible frame. `outer_size` would include the
    // invisible ~7px resize borders and crop background slivers into the shot.
    let hr = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS as u32,
            &mut r as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
    };
    if hr < 0 {
        return None;
    }
    Some(EditorTarget {
        // Same id space as xcap's `Window::id()` (`hwnd.0 as u32`).
        id: hwnd as usize as u32,
        title,
        bounds: ScreenRect { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn native_target<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _win: &tauri::WebviewWindow<R>,
    _title: String,
) -> Option<EditorTarget> {
    None
}

/// macOS: window id → (front-to-back rank, layer) for every on-screen window,
/// from a single `CGWindowListCopyWindowInfo` call. xcap exposes no layer.
#[cfg(target_os = "macos")]
pub fn window_ranks() -> std::collections::HashMap<u32, (usize, i64)> {
    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowListCopyWindowInfo(option: u32, relative_to_window: u32) -> CFArrayRef;
    }
    const ON_SCREEN_ONLY: u32 = 1 << 0;
    const EXCLUDE_DESKTOP_ELEMENTS: u32 = 1 << 4;

    let mut map = std::collections::HashMap::new();
    // SAFETY: plain CoreGraphics call; a non-null result follows the Create
    // rule and is released by `wrap_under_create_rule`.
    let arr_ref = unsafe { CGWindowListCopyWindowInfo(ON_SCREEN_ONLY | EXCLUDE_DESKTOP_ELEMENTS, 0) };
    if arr_ref.is_null() {
        return map;
    }
    let arr: CFArray<CFDictionary<CFString, CFType>> = unsafe { CFArray::wrap_under_create_rule(arr_ref) };
    let id_key = CFString::from_static_string("kCGWindowNumber");
    let layer_key = CFString::from_static_string("kCGWindowLayer");
    for (rank, d) in arr.iter().enumerate() {
        let num = |k: &CFString| {
            d.find(k)
                .and_then(|v| v.downcast::<CFNumber>())
                .and_then(|n| n.to_i64())
        };
        if let (Some(id), Some(layer)) = (num(&id_key), num(&layer_key)) {
            map.insert(id as u32, (rank, layer));
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn win(id: u32, w: u32, h: u32) -> WindowOverlayInfo {
        WindowOverlayInfo { id, title: format!("w{id}"), app_name: "a".into(), x: 0, y: 0, width: w, height: h }
    }
    fn rect(left: i32, top: i32, right: i32, bottom: i32) -> ScreenRect {
        ScreenRect { left, top, right, bottom }
    }

    #[test]
    fn own_windows_are_skipped_except_the_editor() {
        let own = 42;
        assert!(include_window(7, 100, own, None), "other apps pass");
        assert!(!include_window(own, 100, own, None), "overlay/ring/hud skipped");
        assert!(!include_window(own, 100, own, Some(200)), "non-editor own window skipped");
        assert!(include_window(own, 200, own, Some(200)), "editor passes when it is a target");
    }

    #[test]
    fn front_to_back_lets_the_visible_editor_beat_a_smaller_window_behind_it() {
        // editor (big) is in front of a small window it covers.
        let mut out = vec![win(2, 300, 200), win(1, 1400, 900)];
        let info = HashMap::from([(1, (0, 0)), (2, (1, 0))]);
        order_front_to_back(&mut out, &info, Some(1));
        assert_eq!(out.iter().map(|w| w.id).collect::<Vec<_>>(), vec![1, 2]);
    }

    #[test]
    fn a_dialog_in_front_of_a_large_window_still_wins() {
        let mut out = vec![win(10, 1600, 1000), win(11, 400, 300)];
        let info = HashMap::from([(11, (0, 0)), (10, (1, 0))]);
        order_front_to_back(&mut out, &info, None);
        assert_eq!(out[0].id, 11);
    }

    #[test]
    fn other_apps_floating_overlays_are_dropped_but_a_pinned_editor_is_kept() {
        // 5 = a border/window-manager overlay at layer 25 covering the screen.
        let mut out = vec![win(5, 1920, 1080), win(1, 1400, 900), win(3, 800, 600)];
        let info = HashMap::from([(5, (0, 25)), (1, (1, 3)), (3, (2, 0))]);
        order_front_to_back(&mut out, &info, Some(1));
        assert_eq!(out.iter().map(|w| w.id).collect::<Vec<_>>(), vec![1, 3]);
    }

    #[test]
    fn windows_missing_from_the_snapshot_are_kept_last() {
        let mut out = vec![win(9, 10, 10), win(3, 800, 600)];
        let info = HashMap::from([(3, (0, 0))]);
        order_front_to_back(&mut out, &info, None);
        assert_eq!(out.iter().map(|w| w.id).collect::<Vec<_>>(), vec![3, 9]);
    }

    fn editor(bounds: ScreenRect) -> EditorTarget {
        EditorTarget { id: 77, title: "capz".into(), bounds }
    }

    #[test]
    fn editor_entry_is_monitor_local_and_scaled() {
        let mon = rect(1920, 0, 1920 + 2880, 1800); // 150% monitor right of primary
        let e = editor_entry(&editor(rect(2220, 150, 2220 + 1500, 150 + 900)), mon, 1.5).unwrap();
        assert_eq!((e.x, e.y, e.width, e.height), (200, 100, 1000, 600));
        assert_eq!(e.id, 77);
    }

    #[test]
    fn editor_entry_clips_to_the_monitor_and_skips_other_monitors() {
        let mon = rect(0, 0, 1920, 1080);
        // Hangs off the left edge (negative x).
        let e = editor_entry(&editor(rect(-300, 100, 700, 600)), mon, 1.0).unwrap();
        assert_eq!((e.x, e.y, e.width, e.height), (0, 100, 700, 500));
        assert!(editor_entry(&editor(rect(2000, 0, 2500, 400)), mon, 1.0).is_none());
    }

    #[test]
    fn editor_crop_uses_the_monitor_holding_most_of_it() {
        let mons = [(1, rect(0, 0, 1920, 1080)), (2, rect(1920, 0, 3840, 1080))];
        // 1520px on monitor 2, 400px on monitor 1.
        let crop = editor_crop(rect(1520, 100, 3440, 700), &mons).unwrap();
        assert_eq!(crop, (2, 0, 100, 1520, 600));
    }

    #[test]
    fn editor_crop_clips_a_negative_origin_instead_of_shifting() {
        let mons = [(1, rect(0, 0, 1920, 1080))];
        assert_eq!(editor_crop(rect(-50, -20, 950, 680), &mons), Some((1, 0, 0, 950, 680)));
        assert_eq!(editor_crop(rect(-900, 0, -100, 400), &mons), None);
    }
}
