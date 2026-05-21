use tauri::{AppHandle, Manager, Runtime};

#[tauri::command]
pub fn close_overlay_command<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("overlay") {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
