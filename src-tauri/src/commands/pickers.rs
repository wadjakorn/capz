use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use xcap::Window as XcapWindow;

use crate::services::{monitor_service, window_service};

#[derive(Debug, Clone, Serialize)]
pub struct WindowOverlayInfo {
    pub id: u32,
    pub title: String,
    pub app_name: String,
    /// Monitor-local logical x.
    pub x: i32,
    /// Monitor-local logical y.
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Enumerate capturable windows on a given monitor in front-to-back order.
/// Filters out own pid, minimized / zero-area windows, and windows whose
/// `current_monitor()` is not `monitor_id`. Coordinates are converted to
/// monitor-local logical pixels so the overlay frontend can hit-test in its
/// own viewport space.
#[tauri::command]
pub async fn list_capture_windows(monitor_id: u32) -> Result<Vec<WindowOverlayInfo>, String> {
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<WindowOverlayInfo>> {
        let mon = monitor_service::monitor_by_id(monitor_id)?;
        let mx = mon.x().map_err(|e| anyhow::anyhow!("mon.x: {e}"))?;
        let my = mon.y().map_err(|e| anyhow::anyhow!("mon.y: {e}"))?;
        let own_pid = std::process::id();
        let wins = XcapWindow::all().map_err(|e| anyhow::anyhow!("Window::all: {e}"))?;
        let mut out = Vec::new();
        for w in wins {
            let pid = w.pid().unwrap_or(0);
            if pid == own_pid {
                continue;
            }
            if w.is_minimized().unwrap_or(false) {
                continue;
            }
            let width = w.width().unwrap_or(0);
            let height = w.height().unwrap_or(0);
            if width == 0 || height == 0 {
                continue;
            }
            let win_mon_id = w.current_monitor().and_then(|m| m.id()).unwrap_or(0);
            if win_mon_id != monitor_id {
                continue;
            }
            let title = w.title().unwrap_or_default();
            let app_name = w.app_name().unwrap_or_default();
            if title.trim().is_empty() && app_name.trim().is_empty() {
                continue;
            }
            let gx = w.x().unwrap_or(0);
            let gy = w.y().unwrap_or(0);
            let id = match w.id() {
                Ok(id) => id,
                Err(_) => continue,
            };
            out.push(WindowOverlayInfo {
                id,
                title,
                app_name,
                x: gx - mx,
                y: gy - my,
                width,
                height,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())
}

/// Capture an entire monitor. Closes overlays first (so the overlay isn't
/// included in the screen-grab), then dispatches through the editor pipeline.
#[tauri::command]
pub async fn capture_full_monitor<R: Runtime>(
    app: AppHandle<R>,
    monitor_id: u32,
) -> Result<String, String> {
    close_overlays_and_wait(&app).await?;
    crate::commands::capture::capture_to_editor(
        app,
        format!("capture_full_monitor({monitor_id})"),
        move || crate::services::capture_service::capture_monitor(monitor_id),
    )
    .await
}

/// Capture a specific window by id. Closes overlays first for consistency
/// (xcap reads the off-screen buffer so the overlay wouldn't appear, but we
/// still drop focus before the editor pops).
#[tauri::command]
pub async fn capture_window_command<R: Runtime>(
    app: AppHandle<R>,
    window_id: u32,
) -> Result<String, String> {
    close_overlays_and_wait(&app).await?;
    crate::commands::capture::capture_to_editor(
        app,
        format!("capture_window({window_id})"),
        move || window_service::capture_window(window_id),
    )
    .await
}

async fn close_overlays_and_wait<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let app_close = app.clone();
    app.run_on_main_thread(move || {
        for (label, win) in app_close.webview_windows() {
            if label.starts_with("overlay-") || label == "overlay" {
                let _ = win.close();
            }
        }
    })
    .map_err(|e| e.to_string())?;
    tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    Ok(())
}
