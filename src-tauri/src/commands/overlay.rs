use tauri::{AppHandle, Manager, Runtime};

use crate::windows;

#[tauri::command]
pub fn close_overlay_command<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    windows::close_overlays(&app);
    // A cancelled selection must not leave a layer intent armed for whatever
    // capture happens next.
    app.state::<crate::state::AppState>().set_pending_layer(false);
    windows::show_editor_if_hidden(&app);
    Ok(())
}
