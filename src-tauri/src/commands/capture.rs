use tauri::{AppHandle, Runtime};

use crate::services::{capture_service, image_service, monitor_service};

#[tauri::command]
pub async fn list_monitors_command() -> Result<Vec<monitor_service::MonitorInfo>, String> {
    tokio::task::spawn_blocking(monitor_service::list_monitors)
        .await
        .map_err(|e| format!("join: {e}"))?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn capture_full_command<R: Runtime>(_app: AppHandle<R>) -> Result<String, String> {
    let path = tokio::task::spawn_blocking(|| -> anyhow::Result<std::path::PathBuf> {
        let img = capture_service::capture_primary()?;
        image_service::write_temp_png(&img)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())?;
    log::info!("capture_full → {}", path.display());
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn capture_monitor_command<R: Runtime>(
    _app: AppHandle<R>,
    monitor_id: u32,
) -> Result<String, String> {
    let path = tokio::task::spawn_blocking(move || -> anyhow::Result<std::path::PathBuf> {
        let img = capture_service::capture_monitor(monitor_id)?;
        image_service::write_temp_png(&img)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())?;
    log::info!("capture_monitor({monitor_id}) → {}", path.display());
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn capture_region_command<R: Runtime>(
    _app: AppHandle<R>,
    monitor_id: u32,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<String, String> {
    let path = tokio::task::spawn_blocking(move || -> anyhow::Result<std::path::PathBuf> {
        let img = capture_service::capture_region(monitor_id, x, y, w, h)?;
        image_service::write_temp_png(&img)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())?;
    log::info!(
        "capture_region(mon={monitor_id}, {x},{y} {w}x{h}) → {}",
        path.display()
    );
    Ok(path.to_string_lossy().into_owned())
}
