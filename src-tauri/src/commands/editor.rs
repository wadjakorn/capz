use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::state::AppState;
use crate::windows;

#[tauri::command]
pub async fn editor_current_image<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    let state = app.state::<AppState>();
    state.current().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn open_editor<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = windows::show_editor(&app2) {
            log::error!("show_editor: {e}");
        }
    })
    .map_err(|e| e.to_string())
}

/// Read an image from the system clipboard, persist it as a temp PNG, then
/// load it into the editor (replacing any prior workspace image).
#[tauri::command]
pub async fn paste_into_editor<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let img = app
        .clipboard()
        .read_image()
        .map_err(|e| format!("clipboard read: {e}"))?;

    let rgba = img.rgba();
    let width = img.width();
    let height = img.height();
    if width == 0 || height == 0 || rgba.is_empty() {
        return Err("clipboard has no image".into());
    }
    let rgba_vec = rgba.to_vec();

    let path = tokio::task::spawn_blocking(move || -> anyhow::Result<std::path::PathBuf> {
        use anyhow::anyhow;
        use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};

        let buf = image::RgbaImage::from_raw(width, height, rgba_vec)
            .ok_or_else(|| anyhow!("rgba dimension mismatch"))?;
        let mut out = Vec::with_capacity((width * height) as usize * 4 / 2);
        PngEncoder::new(&mut out)
            .write_image(&buf, width, height, ExtendedColorType::Rgba8)
            .map_err(|e| anyhow!("png encode: {e}"))?;
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| anyhow!("time: {e}"))?
            .as_millis();
        let path = std::env::temp_dir().join(format!("capz-temp-{ts}.png"));
        std::fs::write(&path, &out).map_err(|e| anyhow!("write {}: {e}", path.display()))?;
        Ok(path)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())?;

    let path_str = path.to_string_lossy().into_owned();
    let app2 = app.clone();
    let p_open = path_str.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = windows::load_editor_image(&app2, &p_open) {
            log::error!("load_editor_image: {e}");
        }
    })
    .map_err(|e| e.to_string())?;
    Ok(path_str)
}
