use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_store::StoreExt;

use crate::commands::permissions::has_screen_recording;
use crate::services::{capture_service, image_service, monitor_service};
use crate::tray;
use crate::windows;
use crate::windows::{close_overlays, hide_overlays_and_wait};

/// Surface a capture error. On macOS, if Screen Recording permission is no
/// longer granted (revoked mid-session via System Settings, or never granted
/// and the underlying capture call silently returned an all-black/empty
/// buffer that hit a downstream error), fire a dedicated event so the
/// frontend can offer a "Re-run onboarding" action instead of a bare error
/// toast. Otherwise fall back to the generic notice channel.
fn emit_capture_error<R: Runtime>(app: &AppHandle<R>, msg: &str) {
    if cfg!(target_os = "macos") && !has_screen_recording() {
        if let Err(e) = app.emit("app:permission-revoked", ()) {
            log::warn!("emit app:permission-revoked: {e}");
        }
        return;
    }
    crate::notice::error(app, msg);
}

const STORE_FILE: &str = "config.json";
const STORE_KEY: &str = "app";
const DEFAULT_JPEG_QUALITY: u8 = 85;

#[derive(Clone, Copy)]
enum IntermediateFormat {
    Png,
    Jpeg(u8),
}

#[derive(Clone, Copy)]
struct IntermediateSpec {
    format: IntermediateFormat,
    max_edge: Option<u32>,
}

impl Default for IntermediateSpec {
    fn default() -> Self {
        Self {
            format: IntermediateFormat::Png,
            max_edge: None,
        }
    }
}

fn read_capture_intermediate<R: Runtime>(app: &AppHandle<R>) -> IntermediateSpec {
    let Ok(store) = app.store(STORE_FILE) else {
        return IntermediateSpec::default();
    };
    let Some(value) = store.get(STORE_KEY) else {
        return IntermediateSpec::default();
    };
    let capture = value.get("capture");

    let quality = capture
        .and_then(|c| c.get("tempJpegQuality"))
        .and_then(|q| q.as_u64())
        .and_then(|q| u8::try_from(q.clamp(1, 100)).ok())
        .unwrap_or(DEFAULT_JPEG_QUALITY);

    let format = match capture
        .and_then(|c| c.get("intermediateFormat"))
        .and_then(|v| v.as_str())
    {
        Some("jpeg") => IntermediateFormat::Jpeg(quality),
        _ => IntermediateFormat::Png,
    };

    let max_edge = capture
        .and_then(|c| c.get("intermediateMaxEdge"))
        .and_then(|v| v.as_u64())
        .and_then(|v| u32::try_from(v).ok())
        .filter(|v| *v > 0);

    IntermediateSpec { format, max_edge }
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
    let spec = read_capture_intermediate(&app);
    let res = tokio::task::spawn_blocking(move || -> anyhow::Result<std::path::PathBuf> {
        let img = capture()?;
        match spec.format {
            IntermediateFormat::Png => image_service::write_temp_png(&img, spec.max_edge),
            IntermediateFormat::Jpeg(q) => image_service::write_temp_jpeg(&img, q, spec.max_edge),
        }
    })
    .await;
    let path = match res {
        Ok(Ok(p)) => p,
        Ok(Err(e)) => {
            tray::set_idle(&app);
            emit_capture_error(&app, &format!("Capture failed: {e}"));
            return Err(e.to_string());
        }
        Err(e) => {
            tray::set_idle(&app);
            emit_capture_error(&app, &format!("Capture failed: {e}"));
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
    hide_overlays_and_wait(&app).await?;
    let res = capture_to_editor(
        app.clone(),
        format!("capture_region(mon={monitor_id}, {x},{y} {w}x{h})"),
        move || capture_service::capture_region(monitor_id, x, y, w, h),
    )
    .await;
    close_overlays(&app);
    res
}
