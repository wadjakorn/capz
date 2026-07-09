use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
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
    let capture_scroll = MenuItem::with_id(
        app,
        "capture_scroll",
        "Scrolling Capture…",
        true,
        None::<&str>,
    )?;
    let sep = PredefinedMenuItem::separator(app)?;
    let open_app = MenuItem::with_id(app, "open_app", "Open App", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit capz", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &capture_full,
            &capture_area,
            &capture_window,
            &capture_scroll,
            &sep,
            &open_app,
            &sep2,
            &quit,
        ],
    )?;

    let icon_path = app.path().resolve(
        "icons/tray/tray_22@2x.png",
        tauri::path::BaseDirectory::Resource,
    )?;
    let icon = tauri::image::Image::from_path(&icon_path)?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("capz")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(e) = windows::show_editor(tray.app_handle()) {
                    log::error!("tray left-click show_editor failed: {e}");
                }
            }
        })
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
            "capture_scroll" => {
                crate::capture_dispatch::dispatch_scroll(app);
            }
            "open_app" => {
                if let Err(e) = windows::show_editor(app) {
                    log::error!("show_editor failed: {e}");
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
