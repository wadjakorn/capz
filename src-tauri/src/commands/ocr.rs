use crate::services::ocr::openthai::{OpenThaiBackend, Region, RESOURCE_SUBDIR};
use crate::services::ocr::{run_detect, OcrResult};
use tauri::Manager;

/// Detect text in the image at `path`. Runs OCR on a blocking thread so the UI
/// stays responsive. Returns top-left pixel-space boxes in image coordinates.
///
/// `engine` is the macOS-only user choice (`general.ocrEngine`): `"vision"`
/// (default) or `"openthai"`. Windows and Linux always use OpenThai, because
/// Windows.Media.Ocr has no Thai recogniser. The webview passes it, so Rust
/// never reads config.json for it. `OcrResult.engine` reports the one used.
///
/// `region` (CP-0100) reads only that part of the image, with OpenThai, and
/// still returns full-image coordinates. Vision has no region support.
#[tauri::command]
pub async fn ocr_detect(
    app: tauri::AppHandle,
    path: String,
    engine: Option<String>,
    region: Option<Region>,
) -> Result<OcrResult, String> {
    let model_dir = app
        .path()
        .resolve(RESOURCE_SUBDIR, tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("ocr model dir: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        detect_blocking(&path, engine.as_deref(), region, model_dir)
    })
    .await
    .map_err(|e| format!("ocr task join error: {e}"))?
}

fn detect_blocking(
    path: &str,
    engine: Option<&str>,
    region: Option<Region>,
    model_dir: std::path::PathBuf,
) -> Result<OcrResult, String> {
    #[cfg(target_os = "macos")]
    if engine != Some("openthai") {
        if region.is_some() {
            return Err("an OCR region needs the OpenThai engine".into());
        }
        let backend = crate::services::ocr::macos::VisionBackend::new();
        return run_detect(&backend, path, "vision").map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "macos"))]
    let _ = engine;
    let backend = OpenThaiBackend::new(model_dir);
    match region {
        None => run_detect(&backend, path, crate::services::ocr::openthai::ENGINE),
        Some(r) => backend.detect_region(path, &r),
    }
    .map_err(|e| format!("{e:#}"))
}
