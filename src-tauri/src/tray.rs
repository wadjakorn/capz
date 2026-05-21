use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};

use crate::windows;

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let capture_full = MenuItem::with_id(app, "capture_full", "Capture Full Screen", true, None::<&str>)?;
    let capture_area = MenuItem::with_id(app, "capture_area", "Capture Area", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&capture_full, &capture_area, &sep, &settings, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Shotr")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "capture_full" => {
                log::info!("tray: capture_full (stub)");
            }
            "capture_area" => {
                log::info!("tray: capture_area (stub)");
            }
            "settings" => {
                if let Err(e) = windows::show_settings(app) {
                    log::error!("show_settings failed: {e}");
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
