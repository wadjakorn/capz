use tauri::{AppHandle, Runtime};

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
