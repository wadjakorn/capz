use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};

use crate::windows;

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let capture_full = MenuItem::with_id(
        app,
        "capture_full",
        "Capture Full Screen",
        true,
        None::<&str>,
    )?;
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
        .tooltip("capz")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "capture_full" => {
                let app2 = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    match crate::services::capture_service::capture_primary()
                        .and_then(|img| crate::services::image_service::write_temp_png(&img))
                    {
                        Ok(path) => {
                            log::info!("tray capture_full → {}", path.display());
                            let path_str = path.to_string_lossy().into_owned();
                            let app3 = app2.clone();
                            let _ = app2.run_on_main_thread(move || {
                                if let Err(e) = windows::show_editor(&app3, &path_str) {
                                    log::error!("show_editor: {e}");
                                }
                            });
                        }
                        Err(e) => log::error!("tray capture_full failed: {e}"),
                    }
                });
            }
            "capture_area" => {
                if let Err(e) = windows::show_overlay(app) {
                    log::error!("show_overlay failed: {e}");
                }
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
