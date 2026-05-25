use serde::Serialize;
use tauri::{AppHandle, Runtime};
use xcap::Window as XcapWindow;

use crate::services::{monitor_service, window_service};
use crate::windows::{close_overlays, hide_overlays_and_wait};

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
    #[cfg(target_os = "macos")]
    if !crate::commands::permissions::has_screen_recording() {
        return Err(
            "Screen Recording permission required. Grant in System Settings → Privacy & Security → Screen Recording, then restart the app."
                .into(),
        );
    }
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<WindowOverlayInfo>> {
        let mon = monitor_service::monitor_by_id(monitor_id)?;
        let mx = mon.x().map_err(|e| anyhow::anyhow!("mon.x: {e}"))?;
        let my = mon.y().map_err(|e| anyhow::anyhow!("mon.y: {e}"))?;
        let mon_w = mon.width().map_err(|e| anyhow::anyhow!("mon.width: {e}"))?;
        let mon_h = mon.height().map_err(|e| anyhow::anyhow!("mon.height: {e}"))?;
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
            let gx = w.x().unwrap_or(0);
            let gy = w.y().unwrap_or(0);
            // Geometric overlap test instead of xcap's current_monitor() — that
            // method returns Err / wrong id for windows on other Spaces or
            // background apps, dropping them entirely.
            let mon_left = mx;
            let mon_top = my;
            let mon_right = mx + mon_w as i32;
            let mon_bottom = my + mon_h as i32;
            let win_right = gx + width as i32;
            let win_bottom = gy + height as i32;
            let overlaps =
                gx < mon_right && win_right > mon_left && gy < mon_bottom && win_bottom > mon_top;
            if !overlaps {
                continue;
            }
            let title = w.title().unwrap_or_default();
            let app_name = w.app_name().unwrap_or_default();
            if title.trim().is_empty() && app_name.trim().is_empty() {
                continue;
            }
            // Skip our own overlay windows in case the pid filter missed them
            // (Tauri webview can live in a separate process on macOS). Match by
            // bundle name (`app` is the Tauri default) — never by title, since
            // user-app titles can contain "capz" if they happen to display the
            // working directory.
            if app_name == "app" {
                continue;
            }
            // Skip macOS system pseudo-windows that pass the size/pid filters
            // but capture as black or system chrome (Dock, wallpaper, status
            // bar items, notification/control center, Spotlight, etc).
            let app_lower = app_name.trim().to_lowercase();
            if matches!(
                app_lower.as_str(),
                "dock"
                    | "window server"
                    | "windowserver"
                    | "wallpaper"
                    | "notification center"
                    | "notificationcenter"
                    | "control center"
                    | "controlcenter"
                    | "spotlight"
                    | "screencapture"
                    | "systemuiserver"
                    | "system ui server"
            ) {
                continue;
            }
            // Skip full-screen backdrop / wallpaper / desktop pseudo-windows
            // whose bounds cover (≥95%) the monitor area at the origin. These
            // sit beneath real app windows in the compositor but xcap returns
            // them in front-of-list order on macOS, swallowing every hit-test.
            let lx = gx - mx;
            let ly = gy - my;
            let covers_w = width as f32 >= mon_w as f32 * 0.95;
            let covers_h = height as f32 >= mon_h as f32 * 0.95;
            let near_origin = lx.abs() <= 4 && ly.abs() <= 4;
            if covers_w && covers_h && near_origin {
                continue;
            }
            let id = match w.id() {
                Ok(id) => id,
                Err(_) => continue,
            };
            out.push(WindowOverlayInfo {
                id,
                title,
                app_name,
                x: lx,
                y: ly,
                width,
                height,
            });
        }
        // Smallest-area windows first so a small app window that overlaps a
        // larger one (eg dialog over main window) wins the hit-test.
        out.sort_by_key(|w| (w.width as u64) * (w.height as u64));
        Ok(out)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())
}

/// Capture an entire monitor. Hides overlays first (so the overlay isn't
/// included in the screen-grab), then dispatches through the editor pipeline,
/// then closes the overlays once xcap has read the screen buffer.
#[tauri::command]
pub async fn capture_full_monitor<R: Runtime>(
    app: AppHandle<R>,
    monitor_id: u32,
) -> Result<String, String> {
    hide_overlays_and_wait(&app).await?;
    let res = crate::commands::capture::capture_to_editor(
        app.clone(),
        format!("capture_full_monitor({monitor_id})"),
        move || crate::services::capture_service::capture_monitor(monitor_id),
    )
    .await;
    close_overlays(&app);
    res
}

/// Capture a specific window by id. Hides overlays first for consistency
/// (xcap reads the off-screen buffer so the overlay wouldn't appear, but we
/// still drop focus before the editor pops).
#[tauri::command]
pub async fn capture_window_command<R: Runtime>(
    app: AppHandle<R>,
    window_id: u32,
) -> Result<String, String> {
    hide_overlays_and_wait(&app).await?;
    let res = crate::commands::capture::capture_to_editor(
        app.clone(),
        format!("capture_window({window_id})"),
        move || window_service::capture_window(window_id),
    )
    .await;
    close_overlays(&app);
    res
}
