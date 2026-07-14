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

/// Read an image file from disk, normalize it to a temp PNG, then load it into
/// the editor (replacing any prior workspace image). Used by file-pick /
/// drag-drop import when Add-image mode is OFF. Decoding via the `image` crate
/// accepts PNG/JPEG/WEBP/GIF/BMP and preserves alpha (re-encoded as RGBA PNG).
#[tauri::command]
pub async fn import_image_file<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<String, String> {
    let temp_path = tokio::task::spawn_blocking(move || -> anyhow::Result<std::path::PathBuf> {
        use anyhow::anyhow;
        use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};

        let rgba = image::open(&path)
            .map_err(|e| anyhow!("decode {path}: {e}"))?
            .to_rgba8();
        let (width, height) = rgba.dimensions();
        if width == 0 || height == 0 {
            return Err(anyhow!("image has zero dimensions"));
        }
        let mut out = Vec::with_capacity((width * height) as usize * 4 / 2);
        PngEncoder::new(&mut out)
            .write_image(&rgba, width, height, ExtendedColorType::Rgba8)
            .map_err(|e| anyhow!("png encode: {e}"))?;
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| anyhow!("time: {e}"))?
            .as_millis();
        let out_path = std::env::temp_dir().join(format!("capz-temp-{ts}.png"));
        std::fs::write(&out_path, &out)
            .map_err(|e| anyhow!("write {}: {e}", out_path.display()))?;
        Ok(out_path)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())?;

    let path_str = temp_path.to_string_lossy().into_owned();
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

/// Read an image file from disk and return it as a `data:image/png;base64,…`
/// URL, WITHOUT touching the workspace. Used by "Add image" mode file-pick /
/// drag-drop to layer the file as an overlay object.
#[tauri::command]
pub async fn read_image_file_data_url(path: String) -> Result<String, String> {
    let data_url = tokio::task::spawn_blocking(move || -> anyhow::Result<String> {
        use anyhow::anyhow;
        use base64::Engine;
        use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};

        let rgba = image::open(&path)
            .map_err(|e| anyhow!("decode {path}: {e}"))?
            .to_rgba8();
        let (width, height) = rgba.dimensions();
        if width == 0 || height == 0 {
            return Err(anyhow!("image has zero dimensions"));
        }
        let mut out = Vec::with_capacity((width * height) as usize * 4 / 2);
        PngEncoder::new(&mut out)
            .write_image(&rgba, width, height, ExtendedColorType::Rgba8)
            .map_err(|e| anyhow!("png encode: {e}"))?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(&out);
        Ok(format!("data:image/png;base64,{encoded}"))
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())?;

    Ok(data_url)
}

/// Read an image from the clipboard and return it as a `data:image/png;base64,…`
/// URL, WITHOUT touching the workspace. Used by "Add image" mode to layer the
/// clipboard image as an overlay object instead of replacing the base.
#[tauri::command]
pub async fn read_clipboard_image_data_url<R: Runtime>(
    app: AppHandle<R>,
) -> Result<String, String> {
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

    let data_url = tokio::task::spawn_blocking(move || -> anyhow::Result<String> {
        use anyhow::anyhow;
        use base64::Engine;
        use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};

        let buf = image::RgbaImage::from_raw(width, height, rgba_vec)
            .ok_or_else(|| anyhow!("rgba dimension mismatch"))?;
        let mut out = Vec::with_capacity((width * height) as usize * 4 / 2);
        PngEncoder::new(&mut out)
            .write_image(&buf, width, height, ExtendedColorType::Rgba8)
            .map_err(|e| anyhow!("png encode: {e}"))?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(&out);
        Ok(format!("data:image/png;base64,{encoded}"))
    })
    .await
    .map_err(|e| format!("join: {e}"))?
    .map_err(|e| e.to_string())?;

    Ok(data_url)
}
