mod accel;
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
    use services::config_store::{config_store_path, CONFIG_STORE_KEY};
    let Ok(path) = config_store_path(app) else {
        return (true, 24);
    };
    let Ok(store) = app.store(path) else {
        return (true, 24);
    };
    let Some(v) = store.get(CONFIG_STORE_KEY) else {
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

/// Logs the resolved settings-store path, existence, size, and last-modified
/// time on every launch. Used to diagnose the "settings wiped after updater"
/// bug: comparing pre-update and post-update log lines confirms whether the
/// store path drifted or the file was replaced.
fn log_store_path_diagnostics<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    match services::config_store::config_store_path(app) {
        Ok(path) => match std::fs::metadata(&path) {
            Ok(meta) => {
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                log::info!(
                    "config store: path={} exists=true size={} mtime_unix={}",
                    path.display(),
                    meta.len(),
                    modified
                );
            }
            Err(e) => log::info!(
                "config store: path={} exists=false ({e})",
                path.display()
            ),
        },
        Err(e) => log::warn!("config store path resolution failed: {e}"),
    }
}

fn is_onboarding_completed<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    use tauri_plugin_store::StoreExt;
    use services::config_store::{config_store_path, CONFIG_STORE_KEY};
    let Ok(path) = config_store_path(app) else {
        return false;
    };
    let store = match app.store(path) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let Some(v) = store.get(CONFIG_STORE_KEY) else {
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
        // MUST be the first plugin registered (Tauri requirement) so it runs
        // before any other plugin can interfere. Second launch while the
        // tray-resident instance is alive surfaces the existing instance's
        // editor window instead of spawning a new process. Windows-relevant;
        // macOS LaunchServices already blocks double-launch of one bundle.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(win) = app.get_webview_window("editor") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
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
            shortcuts::suspend_shortcuts,
            shortcuts::probe_hotkey,
            commands::capture::list_monitors_command,
            commands::capture::capture_full_command,
            commands::capture::capture_monitor_command,
            commands::capture::capture_region_command,
            commands::capture::trigger_capture_command,
            commands::scroll::scroll_capture_start_command,
            commands::scroll::scroll_capture_finish_command,
            commands::scroll::scroll_capture_cancel_command,
            commands::scroll::scroll_capture_auto_start_command,
            commands::scroll::scroll_capture_auto_stop_command,
            commands::overlay::close_overlay_command,
            commands::command_ring::command_ring_select,
            commands::command_ring::command_ring_editor,
            commands::command_ring::close_command_ring,
            commands::editor::editor_current_image,
            commands::editor::open_editor,
            commands::editor::paste_into_editor,
            commands::editor::read_clipboard_image_data_url,
            commands::editor::import_image_file,
            commands::editor::read_image_file_data_url,
            commands::editor::clear_editor_workspace,
            commands::editor::show_settings_command,
            commands::ocr::ocr_detect,
            commands::pickers::list_capture_windows,
            commands::pickers::capture_full_monitor,
            commands::pickers::capture_window_command,
            commands::output::default_save_dir,
            commands::output::reveal_in_finder,
            commands::stickers::list_stickers,
            commands::permissions::has_screen_recording_permission,
            commands::permissions::probe_capture_command,
            commands::permissions::request_screen_recording_permission,
            commands::permissions::open_system_settings_screen_recording,
            commands::permissions::has_accessibility_permission,
            commands::permissions::request_accessibility_permission,
            commands::permissions::open_system_settings_accessibility,
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
            log_store_path_diagnostics(app.handle());
            services::image_service::sweep_stale_temp();
            tray::create_tray(app.handle())?;
            {
                use tauri::Emitter;
                let report = shortcuts::register_shortcuts(app.handle());
                let inactive: Vec<String> = report
                    .iter()
                    .filter(|r| r.status != shortcuts::RegoStatus::Ok)
                    .map(|r| r.requested.clone())
                    .collect();
                if !inactive.is_empty() {
                    log::error!("hotkeys inactive at launch: {inactive:?}");
                    notice::error(
                        app.handle(),
                        format!(
                            "Some shortcuts are inactive ({}). Open Settings to fix them.",
                            inactive.join(", ")
                        ),
                    );
                }
                let _ = app.handle().emit("shortcuts://registration-report", &report);
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
