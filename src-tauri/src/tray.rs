use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, Runtime,
};

use crate::windows;

pub const TRAY_ID: &str = "main-tray";
const IDLE_TOOLTIP: &str = "capz";

pub fn set_busy<R: Runtime>(app: &AppHandle<R>, msg: &str) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(format!("capz — {msg}")));
        let _ = tray.set_title(Some("⋯"));
    }
}

pub fn set_idle<R: Runtime>(app: &AppHandle<R>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(IDLE_TOOLTIP));
        let _ = tray.set_title(Some(""));
    }
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let capture_full = MenuItem::with_id(
        app,
        "capture_full",
        "Capture Full Screen",
        true,
        None::<&str>,
    )?;
    let capture_area = MenuItem::with_id(app, "capture_area", "Capture Area", true, None::<&str>)?;
    let capture_window =
        MenuItem::with_id(app, "capture_window", "Capture Window…", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let open_editor = MenuItem::with_id(app, "open_editor", "Open Editor", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit capz", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &capture_full,
            &capture_area,
            &capture_window,
            &sep,
            &open_editor,
            &sep2,
            &settings,
            &quit,
        ],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("capz")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "capture_full" => {
                crate::capture_dispatch::dispatch_full(app);
            }
            "capture_area" => {
                if let Err(e) = windows::show_overlay(app) {
                    log::error!("show_overlay failed: {e}");
                }
            }
            "capture_window" => {
                crate::capture_dispatch::dispatch_window(app);
            }
            "open_editor" => {
                if let Err(e) = windows::show_editor(app) {
                    log::error!("show_editor failed: {e}");
                }
            }
            "settings" => {
                if let Err(e) = windows::show_settings(app) {
                    log::error!("show_settings failed: {e}");
                }
            }
            "quit" => {
                let state = app.state::<crate::state::AppState>();
                if let Some(prev) = state.swap(None) {
                    if let Err(e) = std::fs::remove_file(&prev) {
                        log::warn!("quit: remove temp {}: {e}", prev.display());
                    }
                }
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
