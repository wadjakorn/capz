use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;
#[cfg(target_os = "macos")]
use tauri::{LogicalPosition, LogicalSize};
#[cfg(not(target_os = "macos"))]
use tauri::{PhysicalPosition, PhysicalSize};

use crate::services::config_store::{config_store_path, CONFIG_STORE_KEY};
use crate::services::monitor_service;

/// Open the editor window and switch its inner view to the onboarding flow.
/// Onboarding no longer has its own window — it lives inside the editor.
pub fn show_onboarding<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    use tauri::Emitter;
    show_editor(app)?;
    if let Err(e) = app.emit_to("editor", "editor:show-onboarding", ()) {
        log::warn!("emit editor:show-onboarding: {e}");
    }
    Ok(())
}

/// Spawn one transparent overlay window per monitor (label `overlay-<id>`).
/// Each window covers a single screen; v1 area selection stays per-monitor.
/// xcap on macOS returns CG points (top-left origin) for monitor x/y/w/h, so we
/// pass them as LogicalPosition/LogicalSize directly — no scale conversion.
pub fn show_overlay<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    show_overlay_mode(app, "area")
}

pub fn show_overlay_mode<R: Runtime>(app: &AppHandle<R>, mode: &str) -> tauri::Result<()> {
    // If any overlay window already exists, just focus the primary one and bail.
    let existing: Vec<_> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with("overlay-"))
        .map(|(_, w)| w)
        .collect();
    if !existing.is_empty() {
        for w in &existing {
            let _ = w.show();
        }
        if let Some(w) = existing.first() {
            let _ = w.set_focus();
        }
        return Ok(());
    }

    let mons = monitor_service::list_monitors()
        .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!("list monitors: {e}")))?;
    if mons.is_empty() {
        return Err(tauri::Error::Anyhow(anyhow::anyhow!("no monitors")));
    }

    // One transparent overlay window per monitor for every mode. Area selection
    // stays per-display (macOS "Displays have separate Spaces" blocks a single
    // window spanning screens). For area mode exactly one display starts as the
    // "owner" that shows the template rect: the display holding the remembered
    // region if it still exists, else the primary. The frontend enforces a
    // single live rect — pressing on another display claims ownership and clears
    // the previous one (see `overlay/page.tsx`).
    // Both area and scroll modes use the drag-to-select template UI, so both
    // designate a single owner display for the initial template rect.
    let selects_region = mode == "area" || mode == "scroll";
    let owner_id: Option<u32> = if selects_region {
        read_last_region_monitor_id(app)
            .filter(|id| mons.iter().any(|m| m.id == *id))
            .or_else(|| mons.iter().find(|m| m.is_primary).map(|m| m.id))
            .or_else(|| mons.first().map(|m| m.id))
    } else {
        None
    };

    struct OverlaySpec {
        label: String,
        url: String,
        x: i32,
        y: i32,
        w: u32,
        h: u32,
    }
    let specs: Vec<OverlaySpec> = mons
        .iter()
        .map(|m| {
            let url = if selects_region {
                let owner = u8::from(Some(m.id) == owner_id);
                format!("overlay/?monitor={}&mode={}&owner={owner}", m.id, mode)
            } else {
                format!("overlay/?monitor={}&mode={}", m.id, mode)
            };
            OverlaySpec {
                label: format!("overlay-{}", m.id),
                url,
                x: m.x,
                y: m.y,
                w: m.width,
                h: m.height,
            }
        })
        .collect();
    if specs.is_empty() {
        return Err(tauri::Error::Anyhow(anyhow::anyhow!("no overlay target")));
    }

    for s in &specs {
        log::info!(
            "overlay {}: pos=({}, {}) size=({}x{})",
            s.label,
            s.x,
            s.y,
            s.w,
            s.h
        );
        let win = WebviewWindowBuilder::new(app, &s.label, WebviewUrl::App(s.url.clone().into()))
            .title("capz — Select area")
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .inner_size(s.w as f64, s.h as f64)
            .position(s.x as f64, s.y as f64)
            .visible(false)
            .build()?;

        // xcap returns CG points (logical) on macOS but physical pixels on Windows/Linux.
        // Use the matching position/size type per platform.
        #[cfg(target_os = "macos")]
        {
            win.set_position(LogicalPosition::new(s.x as f64, s.y as f64))?;
            win.set_size(LogicalSize::new(s.w as f64, s.h as f64))?;
        }
        #[cfg(not(target_os = "macos"))]
        {
            win.set_position(PhysicalPosition::new(s.x, s.y))?;
            win.set_size(PhysicalSize::new(s.w, s.h))?;
        }

        #[cfg(target_os = "windows")]
        disable_dwm_transitions(&win);

        win.show()?;

        #[cfg(target_os = "macos")]
        {
            use objc2::{msg_send, runtime::AnyObject};
            let ns_window = win.ns_window()? as *mut AnyObject;
            unsafe {
                // NSScreenSaverWindowLevel = 1000; above menu bar / dock.
                let _: () = msg_send![ns_window, setLevel: 1000_i64];
                // CanJoinAllSpaces | FullScreenAuxiliary
                let behavior: u64 = (1u64 << 0) | (1u64 << 8);
                let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
            }
        }
    }

    // Focus an overlay so keyboard (Esc) works without a click. Prefer the
    // primary monitor's overlay when present; otherwise the first spec.
    let focus_label = mons
        .iter()
        .find(|m| m.is_primary)
        .map(|m| format!("overlay-{}", m.id))
        .filter(|l| specs.iter().any(|s| s.label == *l))
        .or_else(|| specs.first().map(|s| s.label.clone()));
    if let Some(label) = focus_label {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.set_focus();
        }
    }

    // macOS: cursor only delivers events to focused NSWindow. Poll cursor
    // position and re-focus the overlay whose CG rect contains it, so the user
    // doesn't need to click each new monitor to activate it.
    #[cfg(target_os = "macos")]
    {
        let labels: Vec<(String, i32, i32, i32, i32)> = specs
            .iter()
            .map(|s| {
                (
                    s.label.clone(),
                    s.x,
                    s.y,
                    s.x + s.w as i32,
                    s.y + s.h as i32,
                )
            })
            .collect();
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut last_label: Option<String> = None;
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(40)).await;
                // Exit when no overlays remain.
                let any_overlay = app_clone
                    .webview_windows()
                    .keys()
                    .any(|k| k.starts_with("overlay-"));
                if !any_overlay {
                    break;
                }
                let pt = unsafe { cursor_cg_point() };
                let Some(pt) = pt else { continue };
                let hit = labels
                    .iter()
                    .find(|(_, x0, y0, x1, y1)| {
                        pt.0 >= *x0 as f64
                            && pt.0 < *x1 as f64
                            && pt.1 >= *y0 as f64
                            && pt.1 < *y1 as f64
                    })
                    .map(|(l, ..)| l.clone());
                if let Some(label) = hit {
                    if last_label.as_deref() != Some(label.as_str()) {
                        last_label = Some(label.clone());
                        let app2 = app_clone.clone();
                        let _ = app_clone.run_on_main_thread(move || {
                            if let Some(w) = app2.get_webview_window(&label) {
                                let _ = w.set_focus();
                            }
                        });
                    }
                }
            }
        });
    }

    Ok(())
}

/// Read current cursor position, convert to CG top-left coords (matching xcap monitor x/y).
/// Returns None on failure.
#[cfg(target_os = "macos")]
unsafe fn cursor_cg_point() -> Option<(f64, f64)> {
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
    Some((pt.x, h_primary - pt.y))
}

/// Show (or create) the single persistent editor window. No image is loaded
/// here — call `load_editor_image` to push a path into the workspace.
pub fn show_editor<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("editor") {
        win.show()?;
        win.unminimize().ok();
        macos_activate();
        win.set_focus()?;
        let _ = win.set_always_on_top(read_always_on_top_editor(app));
        return Ok(());
    }

    let (w, h) = read_editor_window_size(app);
    WebviewWindowBuilder::new(app, "editor", WebviewUrl::App("editor/".into()))
        .title("capz — Editor")
        .inner_size(w, h)
        .min_inner_size(1024.0, 680.0)
        .resizable(true)
        .visible(true)
        .build()?;

    macos_activate();
    if let Some(win) = app.get_webview_window("editor") {
        let _ = win.set_focus();
        let _ = win.set_always_on_top(read_always_on_top_editor(app));
    }
    Ok(())
}

fn read_editor_window_size<R: Runtime>(app: &AppHandle<R>) -> (f64, f64) {
    let default = (1024.0_f64, 680.0_f64);
    let Ok(path) = config_store_path(app) else {
        return default;
    };
    let Ok(store) = app.store(path) else {
        return default;
    };
    let Some(v) = store.get(CONFIG_STORE_KEY) else {
        return default;
    };
    let ew = v.get("general").and_then(|g| g.get("editorWindow"));
    let w = ew
        .and_then(|e| e.get("width"))
        .and_then(|n| n.as_f64())
        .unwrap_or(default.0)
        .max(1024.0);
    let h = ew
        .and_then(|e| e.get("height"))
        .and_then(|n| n.as_f64())
        .unwrap_or(default.1)
        .max(680.0);
    (w, h)
}

/// Read `lastUsed.region.monitorId` from the persisted config, if present.
/// Used to pick which display shows the area-capture template rect first.
fn read_last_region_monitor_id<R: Runtime>(app: &AppHandle<R>) -> Option<u32> {
    let path = config_store_path(app).ok()?;
    let store = app.store(path).ok()?;
    let v = store.get(CONFIG_STORE_KEY)?;
    v.get("lastUsed")
        .and_then(|l| l.get("region"))
        .and_then(|r| r.get("monitorId"))
        .and_then(|n| n.as_u64())
        .and_then(|n| u32::try_from(n).ok())
}

fn read_always_on_top_editor<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Ok(path) = config_store_path(app) else {
        return false;
    };
    let Ok(store) = app.store(path) else {
        return false;
    };
    let Some(v) = store.get(CONFIG_STORE_KEY) else {
        return false;
    };
    v.get("general")
        .and_then(|g| g.get("alwaysOnTopEditor"))
        .and_then(|b| b.as_bool())
        .unwrap_or(false)
}

#[tauri::command]
pub fn set_editor_always_on_top<R: Runtime>(app: AppHandle<R>, on: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("editor") {
        win.set_always_on_top(on).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Set the active workspace image (replacing/removing any prior temp PNG),
/// then ensure the editor window is visible and notify the frontend.
pub fn load_editor_image<R: Runtime>(app: &AppHandle<R>, path: &str) -> tauri::Result<()> {
    use tauri::Emitter;

    let state = app.state::<crate::state::AppState>();
    let prior = state.swap(Some(std::path::PathBuf::from(path)));
    if let Some(prev) = prior {
        if prev != std::path::Path::new(path) {
            if let Err(e) = std::fs::remove_file(&prev) {
                log::warn!("remove prior temp {}: {e}", prev.display());
            }
        }
    }

    show_editor(app)?;
    if let Err(e) = app.emit_to("editor", "editor:load-image", path.to_string()) {
        log::warn!("emit editor:load-image: {e}");
    }
    crate::services::sound::play_capture_sound(app);
    Ok(())
}

fn macos_activate() {
    #[cfg(target_os = "macos")]
    {
        use objc2::{class, msg_send, runtime::AnyObject};
        unsafe {
            let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
        }
    }
}

fn is_overlay_label(label: &str) -> bool {
    label.starts_with("overlay-") || label == "overlay"
}

/// Hide every overlay window on the main thread, then poll until the OS
/// reports all of them invisible. Used before `xcap` reads the screen so the
/// overlay does not bleed into the captured image.
///
/// Windows: each overlay HWND has `DWMWA_TRANSITIONS_FORCEDISABLED` set at
/// build (see `disable_dwm_transitions`), so `hide()` is instant — no shrink
/// animation for BitBlt to bake into the capture. Without that flag, DWM
/// animates the window out and xcap can grab a mid-shrink frame.
pub async fn hide_overlays_and_wait<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let app_hide = app.clone();
    app.run_on_main_thread(move || {
        for (label, win) in app_hide.webview_windows() {
            if is_overlay_label(&label) {
                if let Err(e) = win.hide() {
                    log::warn!("hide {label} failed: {e}");
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;

    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(400);
    loop {
        let all_hidden = app
            .webview_windows()
            .iter()
            .filter(|(label, _)| is_overlay_label(label))
            .all(|(_, w)| !w.is_visible().unwrap_or(true));
        if all_hidden {
            break;
        }
        if std::time::Instant::now() >= deadline {
            log::warn!("hide_overlays_and_wait: timed out waiting for overlays to hide");
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(16)).await;
    }
    // Settle: block until the next compositor frame is presented so the
    // hidden state is guaranteed to be in the buffer xcap reads. Windows uses
    // DwmFlush() — deterministic, frame-rate independent. macOS / Linux fall
    // back to a short fixed delay (CA recomposites within ~1 frame of
    // orderOut: and the bug rarely repros there).
    #[cfg(target_os = "windows")]
    {
        tokio::task::spawn_blocking(|| {
            // SAFETY: DwmFlush takes no parameters and is documented thread-safe.
            // Returns S_OK on success, error HRESULT otherwise. We don't propagate
            // the error: a failed flush degrades to a no-op which leaves the
            // prior poll-visibility loop as the only guard — acceptable fallback.
            unsafe {
                let _ = windows_sys::Win32::Graphics::Dwm::DwmFlush();
            }
        })
        .await
        .map_err(|e| format!("DwmFlush join: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
    }
    Ok(())
}

/// Hide the editor window (if it exists and is visible) and wait until the
/// OS reports it invisible. Used before xcap reads the screen so the editor
/// chrome doesn't appear in captures initiated from inside the editor.
pub async fn hide_editor_and_wait<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let Some(win) = app.get_webview_window("editor") else {
        return Ok(());
    };
    if !win.is_visible().unwrap_or(false) {
        return Ok(());
    }
    let app_hide = app.clone();
    app.run_on_main_thread(move || {
        if let Some(w) = app_hide.get_webview_window("editor") {
            if let Err(e) = w.hide() {
                log::warn!("hide editor failed: {e}");
            }
        }
    })
    .map_err(|e| e.to_string())?;

    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(400);
    loop {
        let hidden = app
            .get_webview_window("editor")
            .map(|w| !w.is_visible().unwrap_or(true))
            .unwrap_or(true);
        if hidden {
            break;
        }
        if std::time::Instant::now() >= deadline {
            log::warn!("hide_editor_and_wait: timed out");
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(16)).await;
    }
    #[cfg(target_os = "windows")]
    {
        tokio::task::spawn_blocking(|| unsafe {
            let _ = windows_sys::Win32::Graphics::Dwm::DwmFlush();
        })
        .await
        .map_err(|e| format!("DwmFlush join: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
    }
    Ok(())
}

/// Show the editor window only if it exists and is currently hidden.
/// No-op when already visible (so we don't steal focus mid-overlay).
pub fn show_editor_if_hidden<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("editor") {
        if !win.is_visible().unwrap_or(true) {
            if let Err(e) = win.show() {
                log::warn!("show_editor_if_hidden: {e}");
            }
        }
    }
}

/// Windows: disable DWM open/close shrink animation for this HWND so
/// subsequent `hide()` / `close()` are instant. Without this, xcap (BitBlt
/// path) can read a mid-shrink frame and bake a smaller overlay into the
/// capture on machines with "Animate windows when minimizing/maximizing" on.
#[cfg(target_os = "windows")]
fn disable_dwm_transitions<R: Runtime>(win: &tauri::WebviewWindow<R>) {
    use windows_sys::Win32::Foundation::{BOOL, HWND, TRUE};
    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
    let hwnd = match win.hwnd() {
        Ok(h) => h.0 as HWND,
        Err(e) => {
            log::warn!("hwnd() for overlay failed: {e}");
            return;
        }
    };
    let on: BOOL = TRUE;
    let res = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED as u32,
            &on as *const _ as *const _,
            std::mem::size_of::<BOOL>() as u32,
        )
    };
    if res < 0 {
        log::warn!("DwmSetWindowAttribute(TRANSITIONS_FORCEDISABLED) failed: 0x{res:08x}");
    }
}

/// Destroy any overlay windows still around. Safe to call after capture
/// regardless of whether the overlays were hidden first.
pub fn close_overlays<R: Runtime>(app: &AppHandle<R>) {
    let app_close = app.clone();
    let _ = app.run_on_main_thread(move || {
        for (label, win) in app_close.webview_windows() {
            if is_overlay_label(&label) {
                if let Err(e) = win.close() {
                    log::warn!("close {label} failed: {e}");
                }
            }
        }
    });
}

/// Label of the compact scrolling-capture HUD (Capture/Cancel + live progress).
/// Deliberately not `overlay-*` so overlay hide/close helpers leave it alone.
pub const SCROLL_HUD_LABEL: &str = "scroll-hud";
pub const SCROLL_GUIDE_LABEL: &str = "scroll-guide";

/// Thickness (logical px) of the capture-region guide outline. The guide window
/// is the region grown by this much on every side, so the border ring lands
/// just *outside* the captured pixels (kept in sync with the `2px` border in
/// `src/app/scroll-guide/page.tsx`).
const GUIDE_BORDER: f64 = 2.0;

/// Logical size of the HUD pill.
const HUD_W: f64 = 380.0;
const HUD_H: f64 = 76.0;
/// Gap between the HUD and the nearest edge of the capture region / display
/// (logical px).
const HUD_BOTTOM_MARGIN: f64 = 48.0;

/// Top-left position for the HUD so its `hud_w × hud_h` rect does **not** overlap
/// the capture region, while staying fully inside the display. Every argument
/// shares one unit and origin (logical points on macOS, physical pixels on
/// Windows/Linux — the caller converts the region into whichever space the
/// monitor geometry uses). The region origin is already expressed in the
/// display's coordinate space (display origin + capture offset).
///
/// The sampler grabs the whole monitor and crops the region, so anything drawn
/// over the region — including this HUD — is baked into every frame (ticket
/// ixD-igh14WRG). We therefore park the HUD just outside the region: below it,
/// then above, then right, then left, picking the first placement that fits
/// on-screen. Because each candidate is disjoint from the region along one axis,
/// a candidate that fits the display cannot overlap the region. Only when the
/// region effectively fills the display (no placement fits) do we fall back to
/// the legacy bottom-center spot, which may overlap — there is simply nowhere
/// else to put it.
fn hud_position(
    disp_x: f64,
    disp_y: f64,
    disp_w: f64,
    disp_h: f64,
    reg_x: f64,
    reg_y: f64,
    reg_w: f64,
    reg_h: f64,
    hud_w: f64,
    hud_h: f64,
    margin: f64,
) -> (f64, f64) {
    let disp_right = disp_x + disp_w;
    let disp_bottom = disp_y + disp_h;
    let reg_right = reg_x + reg_w;
    let reg_bottom = reg_y + reg_h;

    // Clamp `v` into `[lo, hi]`; `hi` is floored at `lo` so a HUD wider/taller
    // than the display still lands at the display origin rather than off-screen.
    let clampf = |v: f64, lo: f64, hi: f64| v.clamp(lo, hi.max(lo));
    // Center the HUD on the region along the free axis, then clamp on-screen.
    let center_x = clampf(reg_x + (reg_w - hud_w) / 2.0, disp_x, disp_right - hud_w);
    let center_y = clampf(reg_y + (reg_h - hud_h) / 2.0, disp_y, disp_bottom - hud_h);

    // Below the region.
    let below_y = reg_bottom + margin;
    if below_y + hud_h <= disp_bottom {
        return (center_x, below_y);
    }
    // Above the region.
    let above_y = reg_y - margin - hud_h;
    if above_y >= disp_y {
        return (center_x, above_y);
    }
    // Right of the region.
    let right_x = reg_right + margin;
    if right_x + hud_w <= disp_right {
        return (right_x, center_y);
    }
    // Left of the region.
    let left_x = reg_x - margin - hud_w;
    if left_x >= disp_x {
        return (left_x, center_y);
    }
    // Fallback: legacy bottom-center of the display (region ~fills the display).
    let fx = clampf(disp_x + (disp_w - hud_w) / 2.0, disp_x, disp_right - hud_w);
    let fy = (disp_bottom - hud_h - margin).max(disp_y);
    (fx, fy)
}

/// Show the compact scrolling-capture HUD near — but never over — the capture
/// region on the display that owns it. Transparent, always-on-top, non-resizable.
/// `(x, y, w, h)` is the capture region in physical pixels relative to the
/// monitor's top-left (same contract as `capture_region`). Monitor geometry is
/// logical points on macOS but physical pixels on Windows/Linux (xcap
/// convention), so we place it per-platform exactly like the overlays.
pub fn show_scroll_hud<R: Runtime>(
    app: &AppHandle<R>,
    monitor_id: u32,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(SCROLL_HUD_LABEL) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let mons = monitor_service::list_monitors()
        .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!("list monitors: {e}")))?;
    let m = mons
        .iter()
        .find(|m| m.id == monitor_id)
        .or_else(|| mons.iter().find(|m| m.is_primary))
        .or_else(|| mons.first())
        .ok_or_else(|| tauri::Error::Anyhow(anyhow::anyhow!("no monitor for scroll HUD")))?;

    let win = WebviewWindowBuilder::new(
        app,
        SCROLL_HUD_LABEL,
        WebviewUrl::App("scroll-hud/".into()),
    )
    .title("capz — Scrolling capture")
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .shadow(false)
    .inner_size(HUD_W, HUD_H)
    .visible(false)
    .build()?;

    // Safety net: the HUD is undecorated and non-closable, so in normal use it
    // only goes away via finish/cancel — both of which consume the session
    // *before* closing it. If it ever gets closed out-of-band (future decoration
    // change, OS/window-manager action), stop the sampler and restore the editor
    // so we don't keep capturing forever into an orphaned session. Guarding on
    // `take().is_some()` makes our own finish/cancel teardown a no-op here.
    let app_ev = app.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { .. } = event {
            let orphaned = {
                let st = app_ev.state::<crate::state::AppState>();
                let taken = st.scroll.lock().expect("scroll mutex poisoned").take();
                taken.is_some()
            };
            if orphaned {
                close_scroll_guide(&app_ev);
                show_editor_if_hidden(&app_ev);
            }
        }
    });

    #[cfg(target_os = "macos")]
    {
        // macOS monitor geometry is logical points; the region is physical px,
        // so scale it down into the same space before comparing.
        let scale = if m.scale_factor > 0.0 { m.scale_factor as f64 } else { 1.0 };
        let (px, py) = hud_position(
            m.x as f64,
            m.y as f64,
            m.width as f64,
            m.height as f64,
            m.x as f64 + x as f64 / scale,
            m.y as f64 + y as f64 / scale,
            w as f64 / scale,
            h as f64 / scale,
            HUD_W,
            HUD_H,
            HUD_BOTTOM_MARGIN,
        );
        win.set_size(LogicalSize::new(HUD_W, HUD_H))?;
        win.set_position(LogicalPosition::new(px, py))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Monitor geometry and the region are both physical px here; the region
        // offset is relative to the monitor origin.
        let scale = if m.scale_factor > 0.0 { m.scale_factor as f64 } else { 1.0 };
        let hud_w = HUD_W * scale;
        let hud_h = HUD_H * scale;
        let margin = HUD_BOTTOM_MARGIN * scale;
        let (px, py) = hud_position(
            m.x as f64,
            m.y as f64,
            m.width as f64,
            m.height as f64,
            m.x as f64 + x as f64,
            m.y as f64 + y as f64,
            w as f64,
            h as f64,
            hud_w,
            hud_h,
            margin,
        );
        win.set_size(PhysicalSize::new(hud_w.round() as u32, hud_h.round() as u32))?;
        win.set_position(PhysicalPosition::new(px.round() as i32, py.round() as i32))?;
        #[cfg(target_os = "windows")]
        disable_dwm_transitions(&win);
    }

    win.show()?;
    let _ = win.set_focus();

    #[cfg(target_os = "macos")]
    {
        use objc2::{msg_send, runtime::AnyObject};
        let ns_window = win.ns_window()? as *mut AnyObject;
        unsafe {
            // Above the screen-saver level so it floats over full-screen apps.
            let _: () = msg_send![ns_window, setLevel: 1001_i64];
            let behavior: u64 = (1u64 << 0) | (1u64 << 8); // CanJoinAllSpaces | FullScreenAuxiliary
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
        }
    }

    Ok(())
}

/// Close the scrolling-capture HUD if present.
pub fn close_scroll_hud<R: Runtime>(app: &AppHandle<R>) {
    let app_close = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = app_close.get_webview_window(SCROLL_HUD_LABEL) {
            if let Err(e) = win.close() {
                log::warn!("close scroll HUD failed: {e}");
            }
        }
    });
}

/// Show a transparent, click-through outline around the capture region for the
/// duration of a scrolling capture, so the user can see exactly what is being
/// grabbed while they scroll. The window is the region grown by [`GUIDE_BORDER`]
/// on every side and positioned so its border ring falls just *outside* the
/// captured pixels (the sampler crops to the region, so anything over it is
/// baked into every frame — ticket ixD-igh14WRG). It ignores cursor events, so
/// wheel/clicks pass through to the page beneath.
///
/// Non-critical: callers treat a failure here as a warning, not an abort — the
/// HUD remains the source of truth for finishing/cancelling the capture.
pub fn show_scroll_guide<R: Runtime>(
    app: &AppHandle<R>,
    monitor_id: u32,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(SCROLL_GUIDE_LABEL) {
        let _ = win.show();
        return Ok(());
    }

    let mons = monitor_service::list_monitors()
        .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!("list monitors: {e}")))?;
    let m = mons
        .iter()
        .find(|m| m.id == monitor_id)
        .or_else(|| mons.iter().find(|m| m.is_primary))
        .or_else(|| mons.first())
        .ok_or_else(|| tauri::Error::Anyhow(anyhow::anyhow!("no monitor for scroll guide")))?;

    let win = WebviewWindowBuilder::new(
        app,
        SCROLL_GUIDE_LABEL,
        WebviewUrl::App("scroll-guide/".into()),
    )
    .title("capz — Capture region")
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .shadow(false)
    .visible(false)
    .build()?;

    // Wheel/clicks must reach the page being scrolled underneath.
    let _ = win.set_ignore_cursor_events(true);

    #[cfg(target_os = "macos")]
    {
        // Monitor geometry is logical points; the region is physical px.
        let scale = if m.scale_factor > 0.0 { m.scale_factor as f64 } else { 1.0 };
        let rx = m.x as f64 + x as f64 / scale;
        let ry = m.y as f64 + y as f64 / scale;
        let rw = w as f64 / scale;
        let rh = h as f64 / scale;
        win.set_size(LogicalSize::new(rw + 2.0 * GUIDE_BORDER, rh + 2.0 * GUIDE_BORDER))?;
        win.set_position(LogicalPosition::new(rx - GUIDE_BORDER, ry - GUIDE_BORDER))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Monitor geometry and the region are both physical px here.
        let scale = if m.scale_factor > 0.0 { m.scale_factor as f64 } else { 1.0 };
        let border = GUIDE_BORDER * scale;
        let rx = m.x as f64 + x as f64;
        let ry = m.y as f64 + y as f64;
        win.set_size(PhysicalSize::new(
            (w as f64 + 2.0 * border).round() as u32,
            (h as f64 + 2.0 * border).round() as u32,
        ))?;
        win.set_position(PhysicalPosition::new(
            (rx - border).round() as i32,
            (ry - border).round() as i32,
        ))?;
        #[cfg(target_os = "windows")]
        disable_dwm_transitions(&win);
    }

    win.show()?;

    #[cfg(target_os = "macos")]
    {
        use objc2::{msg_send, runtime::AnyObject};
        let ns_window = win.ns_window()? as *mut AnyObject;
        unsafe {
            // Just below the HUD level (1001) so the pill stays on top, but still
            // above the screen-saver level to float over full-screen apps.
            let _: () = msg_send![ns_window, setLevel: 1000_i64];
            let behavior: u64 = (1u64 << 0) | (1u64 << 8); // CanJoinAllSpaces | FullScreenAuxiliary
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
        }
    }

    Ok(())
}

/// Close the capture-region guide outline if present.
pub fn close_scroll_guide<R: Runtime>(app: &AppHandle<R>) {
    let app_close = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(win) = app_close.get_webview_window(SCROLL_GUIDE_LABEL) {
            if let Err(e) = win.close() {
                log::warn!("close scroll guide failed: {e}");
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::hud_position;

    /// Do two axis-aligned rects (x, y, w, h) overlap with positive area?
    fn overlaps(
        ax: f64,
        ay: f64,
        aw: f64,
        ah: f64,
        bx: f64,
        by: f64,
        bw: f64,
        bh: f64,
    ) -> bool {
        ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah
    }

    /// Is rect `(x, y, w, h)` fully inside the display `(dx, dy, dw, dh)`?
    fn within(x: f64, y: f64, w: f64, h: f64, dx: f64, dy: f64, dw: f64, dh: f64) -> bool {
        x >= dx - 1e-6 && y >= dy - 1e-6 && x + w <= dx + dw + 1e-6 && y + h <= dy + dh + 1e-6
    }

    const HW: f64 = 380.0;
    const HH: f64 = 76.0;
    const MARGIN: f64 = 48.0;

    #[test]
    fn small_top_region_places_hud_below() {
        // 1440x900 display, small region near the top-left.
        let (px, py) = hud_position(
            0.0, 0.0, 1440.0, 900.0, 100.0, 60.0, 400.0, 300.0, HW, HH, MARGIN,
        );
        assert!(!overlaps(
            px, py, HW, HH, 100.0, 60.0, 400.0, 300.0
        ));
        assert!(within(px, py, HW, HH, 0.0, 0.0, 1440.0, 900.0));
        // Region bottom is 360; HUD should sit just below it.
        assert!(py >= 360.0);
    }

    #[test]
    fn tall_bottom_left_column_places_hud_to_the_side() {
        // The reported bug: a tall left column reaching the display bottom. The
        // legacy bottom-center HUD overlapped it; the fix must move it clear.
        let region = (0.0_f64, 0.0_f64, 580.0_f64, 900.0_f64);
        let (px, py) = hud_position(
            0.0, 0.0, 1440.0, 900.0, region.0, region.1, region.2, region.3, HW, HH, MARGIN,
        );
        assert!(
            !overlaps(px, py, HW, HH, region.0, region.1, region.2, region.3),
            "HUD at ({px},{py}) still overlaps the capture region"
        );
        assert!(within(px, py, HW, HH, 0.0, 0.0, 1440.0, 900.0));
        // No vertical room above/below a full-height region, so it goes right.
        assert!(px >= region.0 + region.2);
    }

    #[test]
    fn region_filling_display_falls_back_to_bottom_center() {
        // Region == whole display: nothing fits, so we keep the legacy spot.
        let (px, py) = hud_position(
            0.0, 0.0, 1440.0, 900.0, 0.0, 0.0, 1440.0, 900.0, HW, HH, MARGIN,
        );
        let expected_x = (1440.0 - HW) / 2.0;
        let expected_y = 900.0 - HH - MARGIN;
        assert!((px - expected_x).abs() < 1e-6);
        assert!((py - expected_y).abs() < 1e-6);
    }

    #[test]
    fn respects_non_zero_display_origin() {
        // Secondary monitor whose origin is offset in the global space.
        let (dx, dy, dw, dh) = (1440.0, 200.0, 1920.0, 1080.0);
        let region = (dx + 50.0, dy + 40.0, 600.0, 500.0);
        let (px, py) = hud_position(
            dx, dy, dw, dh, region.0, region.1, region.2, region.3, HW, HH, MARGIN,
        );
        assert!(!overlaps(
            px, py, HW, HH, region.0, region.1, region.2, region.3
        ));
        assert!(within(px, py, HW, HH, dx, dy, dw, dh));
    }
}
