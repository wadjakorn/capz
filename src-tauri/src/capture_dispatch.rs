use tauri::{AppHandle, Runtime};

use crate::shortcuts::CaptureKind;
use crate::windows;

pub fn dispatch_full<R: Runtime>(app: &AppHandle<R>) {
    if let Err(e) = windows::show_overlay_mode(app, "full") {
        log::error!("show_overlay_mode(full) failed: {e}");
    }
}

pub fn dispatch_window<R: Runtime>(app: &AppHandle<R>) {
    if let Err(e) = windows::show_overlay_mode(app, "window") {
        log::error!("show_overlay_mode(window) failed: {e}");
    }
}

pub fn dispatch_scroll<R: Runtime>(app: &AppHandle<R>) {
    if let Err(e) = windows::show_overlay_mode(app, "scroll") {
        log::error!("show_overlay_mode(scroll) failed: {e}");
    }
}

/// Hide the editor (if visible) then dispatch the overlay for the requested
/// capture mode. Used by both the global hotkey path and the in-editor toolbar
/// so a capture launched from the editor never bakes the editor into the shot.
/// Editor re-show happens automatically: on success via
/// `windows::load_editor_image` → `show_editor`, and on user-cancel via
/// `commands::overlay::close_overlay_command` → `show_editor_if_hidden`.
pub async fn trigger_capture<R: Runtime>(
    app: AppHandle<R>,
    kind: CaptureKind,
) -> Result<(), String> {
    windows::hide_editor_and_wait(&app).await?;
    let app_dispatch = app.clone();
    let res = app.run_on_main_thread(move || match kind {
        CaptureKind::Full => dispatch_full(&app_dispatch),
        CaptureKind::Area => {
            if let Err(e) = windows::show_overlay(&app_dispatch) {
                log::error!("show_overlay failed: {e}");
                windows::show_editor_if_hidden(&app_dispatch);
            }
        }
        CaptureKind::Window => dispatch_window(&app_dispatch),
        CaptureKind::Scroll => dispatch_scroll(&app_dispatch),
    });
    if let Err(e) = res {
        windows::show_editor_if_hidden(&app);
        return Err(e.to_string());
    }
    Ok(())
}
