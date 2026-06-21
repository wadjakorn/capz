use crate::services::ocr::{run_detect, OcrResult};

/// Detect text in the image at `path`. Runs OCR on a blocking thread so the UI
/// stays responsive. Returns top-left pixel-space boxes in image coordinates.
#[tauri::command]
pub async fn ocr_detect(path: String) -> Result<OcrResult, String> {
    tauri::async_runtime::spawn_blocking(move || detect_blocking(&path))
        .await
        .map_err(|e| format!("ocr task join error: {e}"))?
}

fn detect_blocking(path: &str) -> Result<OcrResult, String> {
    #[cfg(target_os = "macos")]
    {
        let backend = crate::services::ocr::macos::VisionBackend::new();
        run_detect(&backend, path).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        let backend = crate::services::ocr::windows::WindowsBackend::new();
        run_detect(&backend, path).map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = path;
        Err("OCR is only supported on macOS and Windows".to_string())
    }
}
