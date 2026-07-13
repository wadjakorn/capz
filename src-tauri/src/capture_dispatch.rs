use tauri::{AppHandle, Manager, Runtime};

use crate::services::monitor_service;
use crate::shortcuts::CaptureKind;
use crate::windows;

pub fn dispatch_full<R: Runtime>(app: &AppHandle<R>) {
    // Single-monitor fast path: there is nothing to pick, so grab that one
    // display straight away instead of popping the "click a screen" overlay
    // (saves the redundant click). Multi-monitor still shows the picker.
    //
    // Only fast-path when no overlay is already up. If an area/window/scroll
    // selection is in progress, defer to `show_overlay_mode`, which re-focuses
    // the existing overlay and leaves that in-progress selection intact —
    // matching the multi-monitor path rather than yanking a full-screen shot
    // out from under the user.
    let overlay_open = app
        .webview_windows()
        .keys()
        .any(|label| label.starts_with("overlay-"));
    match monitor_service::list_monitors() {
        Ok(mons) if !overlay_open && mons.len() == 1 => {
            let monitor_id = mons[0].id;
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                capture_single_monitor(app, monitor_id).await;
            });
            return;
        }
        Ok(_) => {}
        Err(e) => log::warn!("dispatch_full: list_monitors failed ({e}); showing picker"),
    }
    if let Err(e) = windows::show_overlay_mode(app, "full") {
        log::error!("show_overlay_mode(full) failed: {e}");
    }
}

/// Capture the sole display directly, bypassing the pick-a-screen overlay.
/// Hides the editor first so a capture launched from it doesn't bake the editor
/// chrome into the shot — this mirrors the hotkey path's pre-dispatch hide and
/// also covers the tray entry point, which dispatches without hiding the editor.
async fn capture_single_monitor<R: Runtime>(app: AppHandle<R>, monitor_id: u32) {
    if let Err(e) = windows::hide_editor_and_wait(&app).await {
        log::warn!("hide editor before instant fullscreen: {e}");
    }
    if let Err(e) =
        crate::commands::pickers::capture_full_monitor(app.clone(), monitor_id).await
    {
        log::error!("instant fullscreen capture failed: {e}");
        windows::show_editor_if_hidden(&app);
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
