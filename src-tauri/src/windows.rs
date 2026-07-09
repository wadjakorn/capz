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

/// Logical size of the HUD pill.
const HUD_W: f64 = 380.0;
const HUD_H: f64 = 76.0;
/// Gap between the HUD and the bottom edge of the owner display (logical px).
const HUD_BOTTOM_MARGIN: f64 = 48.0;

/// Show the compact scrolling-capture HUD, centered near the bottom of the
/// display that owns the capture. Transparent, always-on-top, non-resizable.
/// Monitor geometry is logical points on macOS but physical pixels on
/// Windows/Linux (xcap convention), so we place it per-platform exactly like
/// the overlays.
pub fn show_scroll_hud<R: Runtime>(app: &AppHandle<R>, monitor_id: u32) -> tauri::Result<()> {
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
                st.scroll.lock().expect("scroll mutex poisoned").take().is_some()
            };
            if orphaned {
                show_editor_if_hidden(&app_ev);
            }
        }
    });

    #[cfg(target_os = "macos")]
    {
        let cx = m.x as f64 + (m.width as f64 - HUD_W) / 2.0;
        let cy = m.y as f64 + m.height as f64 - HUD_H - HUD_BOTTOM_MARGIN;
        win.set_size(LogicalSize::new(HUD_W, HUD_H))?;
        win.set_position(LogicalPosition::new(cx.max(m.x as f64), cy.max(m.y as f64)))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let scale = if m.scale_factor > 0.0 { m.scale_factor as f64 } else { 1.0 };
        let pw = (HUD_W * scale).round() as u32;
        let ph = (HUD_H * scale).round() as u32;
        let margin_px = (HUD_BOTTOM_MARGIN * scale).round() as i32;
        // Center horizontally; sit `margin_px` above the bottom edge. The
        // `.max(0)` clamps each offset on its own so the HUD stays on-screen even
        // if it's somehow larger than the monitor.
        let x_off = ((m.width as i32 - pw as i32) / 2).max(0);
        let y_off = (m.height as i32 - ph as i32 - margin_px).max(0);
        let cx = m.x + x_off;
        let cy = m.y + y_off;
        win.set_size(PhysicalSize::new(pw, ph))?;
        win.set_position(PhysicalPosition::new(cx, cy))?;
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
