use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_store::StoreExt;

use crate::commands::permissions::has_screen_recording;
use crate::services::config_store::{config_store_path, CONFIG_STORE_KEY};
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
    let Ok(path) = config_store_path(app) else {
        return IntermediateSpec::default();
    };
    let Ok(store) = app.store(path) else {
        return IntermediateSpec::default();
    };
    let Some(value) = store.get(CONFIG_STORE_KEY) else {
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
pub async fn trigger_capture_command<R: Runtime>(
    app: AppHandle<R>,
    kind: String,
) -> Result<(), String> {
    let parsed = match kind.as_str() {
        "full" => crate::shortcuts::CaptureKind::Full,
        "area" => crate::shortcuts::CaptureKind::Area,
        "window" => crate::shortcuts::CaptureKind::Window,
        other => return Err(format!("unknown capture kind: {other}")),
    };
    crate::capture_dispatch::trigger_capture(app, parsed).await
}

/// Capture an area selection and open it in the editor.
///
/// **Coordinate contract:** `x`/`y`/`w`/`h` are **physical device pixels**,
/// relative to the target monitor's top-left — NOT logical/CSS pixels. The sole
/// caller (the overlay `confirmRegion`) multiplies its logical selection by the
/// webview `devicePixelRatio` before invoking, so passing logical px here would
/// crop the wrong region (the original Windows bug, ticket L9mejWlFPDcZ).
///
/// Degenerate input is handled downstream in [`capture_service::capture_region`],
/// not by panics: zero `w`/`h` returns an error, negative `x`/`y` clamp to the
/// buffer origin, an origin outside the monitor returns an error, and `w`/`h`
/// are clamped to the remaining buffer extent.
#[tauri::command]
pub async fn capture_region_command<R: Runtime>(
    app: AppHandle<R>,
    monitor_id: u32,
    x: i32, // left edge, physical px
    y: i32, // top edge, physical px
    w: u32, // width, physical px
    h: u32, // height, physical px
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

/// Map a selection given in OS virtual-desktop coordinates (the same space as
/// `MonitorInfo` x/y/width/height — logical CG points on macOS, physical px on
/// Windows/Linux) to the monitor it lands on plus a monitor-local rect in
/// **physical** pixels for xcap. Picks the monitor with the largest overlap so a
/// selection straddling a bezel resolves to the screen holding most of it; the
/// rect is clamped to that monitor (no cross-display stitching in v1).
///
/// On macOS the local rect is scaled by the monitor's (reliable) scale factor to
/// reach physical px; on Windows/Linux the coordinates are already physical, so
/// we never touch xcap's scale factor — which is unreliable under fractional
/// Windows scaling (ticket L9mejWlFPDcZ).
fn map_virtual_selection(
    mons: &[monitor_service::MonitorInfo],
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Option<(u32, i32, i32, u32, u32)> {
    let sx0 = x;
    let sy0 = y;
    let sx1 = x + w as i32;
    let sy1 = y + h as i32;
    let mut best: Option<(i64, &monitor_service::MonitorInfo)> = None;
    for m in mons {
        let mx1 = m.x + m.width as i32;
        let my1 = m.y + m.height as i32;
        let ox = (sx1.min(mx1) - sx0.max(m.x)).max(0) as i64;
        let oy = (sy1.min(my1) - sy0.max(m.y)).max(0) as i64;
        let area = ox * oy;
        if area > 0 {
            match best {
                Some((a, _)) if a >= area => {}
                _ => best = Some((area, m)),
            }
        }
    }
    let m = best.map(|(_, m)| m)?;
    // Clamp to the winning monitor (OS units).
    let lx0 = sx0.max(m.x);
    let ly0 = sy0.max(m.y);
    let lx1 = sx1.min(m.x + m.width as i32);
    let ly1 = sy1.min(m.y + m.height as i32);
    let lx = lx0 - m.x;
    let ly = ly0 - m.y;
    let lw = (lx1 - lx0).max(0);
    let lh = (ly1 - ly0).max(0);
    let (px, py, pw, ph) = {
        #[cfg(target_os = "macos")]
        {
            let s = m.scale_factor as f64;
            (
                (lx as f64 * s).round() as i32,
                (ly as f64 * s).round() as i32,
                (lw as f64 * s).round() as i32,
                (lh as f64 * s).round() as i32,
            )
        }
        #[cfg(not(target_os = "macos"))]
        {
            (lx, ly, lw, lh)
        }
    };
    if pw <= 0 || ph <= 0 {
        return None;
    }
    Some((m.id, px, py, pw as u32, ph as u32))
}

/// Capture an area selected on the union overlay. `x`/`y`/`w`/`h` are in OS
/// virtual-desktop coordinates; the target monitor and physical crop are
/// resolved by [`map_virtual_selection`].
#[tauri::command]
pub async fn capture_area_virtual<R: Runtime>(
    app: AppHandle<R>,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> Result<String, String> {
    tray::set_busy(&app, "Capturing…");
    hide_overlays_and_wait(&app).await?;
    let mons = match monitor_service::list_monitors() {
        Ok(m) => m,
        Err(e) => {
            tray::set_idle(&app);
            close_overlays(&app);
            return Err(e.to_string());
        }
    };
    let Some((monitor_id, lx, ly, lw, lh)) = map_virtual_selection(&mons, x, y, w, h) else {
        tray::set_idle(&app);
        close_overlays(&app);
        let msg = "selection is not on any display".to_string();
        emit_capture_error(&app, &msg);
        return Err(msg);
    };
    let res = capture_to_editor(
        app.clone(),
        format!("capture_area_virtual(mon={monitor_id}, {lx},{ly} {lw}x{lh})"),
        move || capture_service::capture_region(monitor_id, lx, ly, lw, lh),
    )
    .await;
    close_overlays(&app);
    res
}
