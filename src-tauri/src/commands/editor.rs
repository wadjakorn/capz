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

/// Drop the active workspace image: clear Rust state, remove the temp PNG,
/// and notify the editor frontend to render the empty state.
#[tauri::command]
pub async fn clear_editor_workspace<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    use tauri::Emitter;

    let state = app.state::<AppState>();
    if let Some(prev) = state.swap(None) {
        if let Err(e) = std::fs::remove_file(&prev) {
            log::warn!("clear_editor_workspace remove {}: {e}", prev.display());
        }
    }
    if let Err(e) = app.emit_to("editor", "editor:clear", ()) {
        log::warn!("emit editor:clear: {e}");
    }
    Ok(())
}

/// Open Settings (now an in-app view inside the editor window). Optional `tab`
/// deep-links to a tab via the `editor:show-settings` payload — the editor
/// frontend switches view and re-emits `settings:focus-tab` for SettingsView.
#[tauri::command]
pub async fn show_settings_command<R: Runtime>(
    app: AppHandle<R>,
    tab: Option<String>,
) -> Result<(), String> {
    use tauri::Emitter;

    let app2 = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = windows::show_editor(&app2) {
            log::error!("show_editor: {e}");
        }
    })
    .map_err(|e| e.to_string())?;

    if let Err(e) = app.emit_to("editor", "editor:show-settings", tab) {
        log::warn!("emit editor:show-settings: {e}");
    }
    Ok(())
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
        if let Err(e) =
            windows::load_editor_image(&app2, &p_open, windows::CaptureSource::Other)
        {
            log::error!("load_editor_image: {e}");
        }
    })
    .map_err(|e| e.to_string())?;
    Ok(path_str)
}
