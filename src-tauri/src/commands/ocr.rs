use crate::services::ocr::openthai::{OpenThaiBackend, RESOURCE_SUBDIR};
use crate::services::ocr::{run_detect, OcrResult};
use tauri::Manager;

/// Detect text in the image at `path`. Runs OCR on a blocking thread so the UI
/// stays responsive. Returns top-left pixel-space boxes in image coordinates.
///
/// `engine` is the macOS-only user choice (`general.ocrEngine`): `"vision"`
/// (default) or `"openthai"`. Windows and Linux always use OpenThai, because
/// Windows.Media.Ocr has no Thai recogniser. The webview passes it, so Rust
/// never reads config.json for it.
#[tauri::command]
pub async fn ocr_detect(
    app: tauri::AppHandle,
    path: String,
    engine: Option<String>,
) -> Result<OcrResult, String> {
    let model_dir = app
        .path()
        .resolve(RESOURCE_SUBDIR, tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("ocr model dir: {e}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        detect_blocking(&path, engine.as_deref(), model_dir)
    })
    .await
    .map_err(|e| format!("ocr task join error: {e}"))?
}

fn detect_blocking(
    path: &str,
    engine: Option<&str>,
    model_dir: std::path::PathBuf,
) -> Result<OcrResult, String> {
    #[cfg(target_os = "macos")]
    if engine != Some("openthai") {
        let backend = crate::services::ocr::macos::VisionBackend::new();
        return run_detect(&backend, path).map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "macos"))]
    let _ = engine;
    let backend = OpenThaiBackend::new(model_dir);
    run_detect(&backend, path).map_err(|e| format!("{e:#}"))
}
