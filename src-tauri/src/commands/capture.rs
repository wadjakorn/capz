use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

use crate::services::{capture_service, image_service, monitor_service};
use crate::tray;
use crate::windows;

const STORE_FILE: &str = "config.json";
const STORE_KEY: &str = "app";
const DEFAULT_JPEG_QUALITY: u8 = 85;

fn read_temp_jpeg_quality<R: Runtime>(app: &AppHandle<R>) -> u8 {
    let Ok(store) = app.store(STORE_FILE) else {
        return DEFAULT_JPEG_QUALITY;
    };
    let Some(value) = store.get(STORE_KEY) else {
        return DEFAULT_JPEG_QUALITY;
    };
    value
        .get("capture")
        .and_then(|c| c.get("tempJpegQuality"))
        .and_then(|q| q.as_u64())
        .and_then(|q| u8::try_from(q.clamp(1, 100)).ok())
        .unwrap_or(DEFAULT_JPEG_QUALITY)
}

#[tauri::command]
pub async fn list_monitors_command() -> Result<Vec<monitor_service::MonitorInfo>, String> {
    tokio::task::spawn_blocking(monitor_service::list_monitors)
        .await
        .map_err(|e| format!("join: {e}"))?
        .map_err(|e| e.to_string())
}

pub async fn capture_to_editor<R, F>(
    app: AppHandle<R>,
    log_tag: String,
    capture: F,
) -> Result<String, String>
where
    R: Runtime,
    F: FnOnce() -> anyhow::Result<image::RgbaImage> + Send + 'static,
{
    tray::set_busy(&app, "Capturing…");
    let quality = read_temp_jpeg_quality(&app);
    let res = tokio::task::spawn_blocking(move || -> anyhow::Result<std::path::PathBuf> {
        let img = capture()?;
        image_service::write_temp_jpeg(&img, quality)
    })
    .await;
    let path = match res {
        Ok(Ok(p)) => p,
        Ok(Err(e)) => {
            tray::set_idle(&app);
            let msg = format!("Capture failed: {e}");
            crate::notice::error(&app, &msg);
            return Err(e.to_string());
        }
        Err(e) => {
            tray::set_idle(&app);
            let msg = format!("Capture failed: {e}");
            crate::notice::error(&app, &msg);
            return Err(format!("join: {e}"));
        }
    };
    let path_str = path.to_string_lossy().into_owned();
    log::info!("{log_tag} → {path_str}");
    let app_main = app.clone();
    let path_open = path_str.clone();
    let main_res = app.run_on_main_thread(move || {
        if let Err(e) = windows::load_editor_image(&app_main, &path_open) {
            log::error!("load_editor_image: {e}");
        }
    });
    tray::set_idle(&app);
    main_res.map_err(|e| e.to_string())?;
    Ok(path_str)
}

#[tauri::command]
pub async fn capture_full_command<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    capture_to_editor(app, "capture_full".into(), capture_service::capture_primary).await
}

#[tauri::command]
pub async fn capture_monitor_command<R: Runtime>(
    app: AppHandle<R>,
    monitor_id: u32,
) -> Result<String, String> {
    capture_to_editor(app, format!("capture_monitor({monitor_id})"), move || {
        capture_service::capture_monitor(monitor_id)
    })
    .await
}

#[tauri::command]
pub async fn capture_region_command<R: Runtime>(
    app: AppHandle<R>,
    monitor_id: u32,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<String, String> {
    tray::set_busy(&app, "Capturing…");
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
    capture_to_editor(
        app,
        format!("capture_region(mon={monitor_id}, {x},{y} {w}x{h})"),
        move || capture_service::capture_region(monitor_id, x, y, w, h),
    )
    .await
}
