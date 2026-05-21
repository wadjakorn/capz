use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

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
    if let Some(win) = app.get_webview_window("settings") {
        win.open_devtools();
    }
    Ok(())
}

/// Spawn transparent fullscreen overlay over the primary monitor.
/// v1: single-monitor area selection only.
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
    let scale = primary.scale_factor.max(1.0);
    let logical_w = primary.width as f64 / scale as f64;
    let logical_h = primary.height as f64 / scale as f64;
    let logical_x = primary.x as f64 / scale as f64;
    let logical_y = primary.y as f64 / scale as f64;
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
        .visible(true)
        .build()?;
    win.set_position(LogicalPosition::new(logical_x, logical_y))?;
    win.set_size(LogicalSize::new(logical_w, logical_h))?;
    win.set_focus()?;
    #[cfg(debug_assertions)]
    win.open_devtools();
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
