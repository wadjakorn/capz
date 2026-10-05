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
    use crate::i18n::{tr, Msg, TrayLabels};
    let item = |id: &str, msg: Msg| MenuItem::with_id(app, id, tr(msg), true, None::<&str>);
    let capture_full = item("capture_full", Msg::TrayCaptureFull)?;
    let capture_area = item("capture_area", Msg::TrayCaptureArea)?;
    let capture_window = item("capture_window", Msg::TrayCaptureWindow)?;
    let capture_scroll = item("capture_scroll", Msg::TrayCaptureScroll)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let open_app = item("open_app", Msg::TrayOpenApp)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = item("quit", Msg::TrayQuit)?;

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

    // Kept so `set_ui_language` can relabel the menu without rebuilding it.
    if let Ok(mut labels) = app.state::<TrayLabels>().0.lock() {
        *labels = vec![
            (Msg::TrayCaptureFull, capture_full.clone()),
            (Msg::TrayCaptureArea, capture_area.clone()),
            (Msg::TrayCaptureWindow, capture_window.clone()),
            (Msg::TrayCaptureScroll, capture_scroll.clone()),
            (Msg::TrayOpenApp, open_app.clone()),
            (Msg::TrayQuit, quit.clone()),
        ];
    }

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
