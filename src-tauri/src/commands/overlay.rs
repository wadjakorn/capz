use tauri::{AppHandle, Manager, Runtime};

use crate::windows;

#[tauri::command]
pub fn close_overlay_command<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    for (label, win) in app.webview_windows() {
        if label.starts_with("overlay-") || label == "overlay" {
            if let Err(e) = win.close() {
                log::warn!("close {label} failed: {e}");
            }
        }
    }
    // A cancelled selection must not leave a layer intent armed for whatever
    // capture happens next.
    app.state::<crate::state::AppState>().set_pending_layer(false);
    windows::show_editor_if_hidden(&app);
    Ok(())
}
