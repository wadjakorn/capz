use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
#[cfg(not(target_os = "macos"))]
use tauri::{LogicalPosition, LogicalSize};

use crate::services::monitor_service;

pub fn show_settings<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("settings") {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("settings/".into()),
    )
    .title("Shotr — Settings")
    .inner_size(720.0, 520.0)
    .resizable(true)
    .visible(true)
    .build()?;
    #[cfg(debug_assertions)]
    // if let Some(win) = app.get_webview_window("settings") {
    //     win.open_devtools();
    // }
    Ok(())
}

/// Spawn transparent overlay over the primary monitor.
/// v1: single-monitor area selection per PLAN.md §5.2.
/// On macOS we raise NSWindow level above the menu bar so the entire screen is selectable.
pub fn show_overlay<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("overlay") {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }
    let mons = monitor_service::list_monitors()
        .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!("list monitors: {e}")))?;
    let primary = mons
        .iter()
        .find(|m| m.is_primary)
        .or_else(|| mons.first())
        .ok_or_else(|| tauri::Error::Anyhow(anyhow::anyhow!("no monitors")))?;
    let scale = primary.scale_factor.max(1.0) as f64;
    let logical_w = primary.width as f64 / scale;
    let logical_h = primary.height as f64 / scale;
    let logical_x = primary.x as f64 / scale;
    let logical_y = primary.y as f64 / scale;
    let url = format!("overlay/?monitor={}", primary.id);

    let win = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App(url.into()))
        .title("Shotr — Select area")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .inner_size(logical_w, logical_h)
        .position(logical_x, logical_y)
        .visible(false)
        .build()?;
    #[cfg(not(target_os = "macos"))]
    {
        win.set_position(LogicalPosition::new(logical_x, logical_y))?;
        win.set_size(LogicalSize::new(logical_w, logical_h))?;
    }

    win.show()?;
    win.set_focus()?;

    #[cfg(target_os = "macos")]
    {
        use objc2::{class, msg_send, runtime::AnyObject};
        use objc2_foundation::NSRect;

        let ns_window = win.ns_window()? as *mut AnyObject;
        unsafe {
            // NSScreenSaverWindowLevel = 1000; above menu bar / dock.
            let _: () = msg_send![ns_window, setLevel: 1000_i64];
            // CanJoinAllSpaces | FullScreenAuxiliary
            let behavior: u64 = (1u64 << 0) | (1u64 << 8);
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

            // Force frame to primary screen (NSScreen.screens[0]) — full incl. menu bar + dock.
            // Done AFTER show() so Tauri's internal show logic can't undo it.
            let screens: *mut AnyObject = msg_send![class!(NSScreen), screens];
            if !screens.is_null() {
                let screen: *mut AnyObject = msg_send![screens, firstObject];
                if !screen.is_null() {
                    let frame: NSRect = msg_send![screen, frame];
                    log::info!(
                        "overlay primary screen frame: origin=({}, {}) size=({}, {})",
                        frame.origin.x,
                        frame.origin.y,
                        frame.size.width,
                        frame.size.height
                    );
                    let _: () = msg_send![ns_window, setFrame: frame, display: true];
                }
            }
        }
    }
    #[cfg(debug_assertions)]
    // win.open_devtools();
    Ok(())
}

pub fn show_editor<R: Runtime>(app: &AppHandle<R>, file_path: &str) -> tauri::Result<()> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let label = format!("editor-{ts}");
    let encoded = urlencoding::encode(file_path);
    let url = format!("editor/?file={encoded}");

    WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("Shotr — Editor")
        .inner_size(1100.0, 760.0)
        .min_inner_size(640.0, 480.0)
        .resizable(true)
        .visible(true)
        .build()?;
    Ok(())
}

#[allow(dead_code)]
pub fn close_overlay<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("overlay") {
        if let Err(e) = win.close() {
            log::warn!("close overlay failed: {e}");
        }
    }
}
