mod capture_dispatch;
mod commands;
mod notice;
mod services;
mod shortcuts;
mod state;
mod tray;
mod windows;

/// Reads `updates.{autoCheck, checkIntervalHours}` from the store with safe defaults.
fn read_update_prefs<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> (bool, u64) {
    use tauri_plugin_store::StoreExt;
    let Ok(store) = app.store("config.json") else {
        return (true, 24);
    };
    let Some(v) = store.get("app") else {
        return (true, 24);
    };
    let auto = v
        .get("updates")
        .and_then(|u| u.get("autoCheck"))
        .and_then(|x| x.as_bool())
        .unwrap_or(true);
    let hours = v
        .get("updates")
        .and_then(|u| u.get("checkIntervalHours"))
        .and_then(|x| x.as_u64())
        .unwrap_or(24)
        .max(1);
    (auto, hours)
}

/// Background tokio task: waits 30s after launch, then emits `updater://check-now`
/// at the user-configured interval. Frontend (Settings or Editor window) handles
/// the actual check via `tauri-plugin-updater` and any prompt UI.
fn spawn_update_checker<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    use tauri::Emitter;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        loop {
            let (auto, hours) = read_update_prefs(&app);
            if auto {
                if let Err(e) = app.emit("updater://check-now", ()) {
                    log::warn!("emit updater://check-now: {e}");
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(hours * 3600)).await;
        }
    });
}

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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
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
            commands::permissions::show_onboarding_window,
            windows::set_editor_always_on_top,
        ])
        .manage(state::AppState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Info
                    } else {
                        log::LevelFilter::Warn
                    })
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                            file_name: None,
                        }),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    ])
                    .max_file_size(1_000_000)
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                    .build(),
            )?;
            services::image_service::sweep_stale_temp();
            tray::create_tray(app.handle())?;
            if let Err(e) = shortcuts::register_shortcuts(app.handle()) {
                log::error!("global shortcut registration failed: {e}");
                notice::error(
                    app.handle(),
                    format!("Global shortcut registration failed: {e}"),
                );
            }
            if !is_onboarding_completed(app.handle()) {
                if let Err(e) = windows::show_onboarding(app.handle()) {
                    log::warn!("show onboarding: {e}");
                }
            }
            spawn_update_checker(app.handle().clone());
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
