mod capture_dispatch;
mod commands;
mod services;
mod shortcuts;
mod state;
mod tray;
mod windows;

fn is_onboarding_completed<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    use tauri_plugin_store::StoreExt;
    let store = match app.store("config.json") {
        Ok(s) => s,
        Err(_) => return false,
    };
    let Some(v) = store.get("app") else {
        return false;
    };
    v.get("general")
        .and_then(|g| g.get("onboardingCompleted"))
        .and_then(|x| x.as_bool())
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            shortcuts::reregister_shortcuts,
            commands::capture::list_monitors_command,
            commands::capture::capture_full_command,
            commands::capture::capture_monitor_command,
            commands::capture::capture_region_command,
            commands::overlay::close_overlay_command,
            commands::editor::editor_current_image,
            commands::editor::open_editor,
            commands::editor::paste_into_editor,
            commands::pickers::list_capture_windows,
            commands::pickers::capture_full_monitor,
            commands::pickers::capture_window_command,
            commands::output::default_save_dir,
            commands::output::reveal_in_finder,
            commands::permissions::has_screen_recording_permission,
            commands::permissions::request_screen_recording_permission,
            commands::permissions::open_system_settings_screen_recording,
            commands::permissions::relaunch_app,
        ])
        .manage(state::AppState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            services::image_service::sweep_stale_temp();
            tray::create_tray(app.handle())?;
            if let Err(e) = shortcuts::register_shortcuts(app.handle()) {
                log::error!("global shortcut registration failed: {e}");
            }
            if !is_onboarding_completed(app.handle()) {
                if let Err(e) = windows::show_onboarding(app.handle()) {
                    log::warn!("show onboarding: {e}");
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
