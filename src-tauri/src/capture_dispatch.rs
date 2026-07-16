use tauri::{AppHandle, Manager, Runtime};

use crate::services::monitor_service;
use crate::shortcuts::CaptureKind;
use crate::windows;

pub fn dispatch_full<R: Runtime>(app: &AppHandle<R>) {
    // Always grab the monitor under the cursor instantly — no "click a screen"
    // picker, for any monitor count. The cursor is the user's target display, so
    // resolving it in Rust means we never show an overlay, never steal OS focus,
    // and a source app's transient state (open dropdown, hover tooltip, context
    // menu) survives the capture (ticket CP-0024). Multi-monitor no longer
    // detours through the focus-stealing picker.
    //
    // Exception: if an area/window/scroll selection overlay is already up, defer
    // to `show_overlay_mode`, which re-focuses that existing overlay (and creates
    // nothing) rather than yanking a full-screen shot out from under an
    // in-progress selection.
    let overlay_open = app
        .webview_windows()
        .keys()
        .any(|label| label.starts_with("overlay-"));
    if overlay_open {
        if let Err(e) = windows::show_overlay_mode(app, "full") {
            log::error!("show_overlay_mode(full) failed: {e}");
        }
        return;
    }
    let monitor_id = match monitor_service::monitor_under_cursor() {
        Ok(id) => id,
        Err(e) => {
            log::error!("dispatch_full: no monitor to capture ({e})");
            return;
        }
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        capture_single_monitor(app, monitor_id).await;
    });
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
