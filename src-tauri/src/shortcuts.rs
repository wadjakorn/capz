use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

use crate::services::{capture_service, image_service};
use crate::windows;

const STORE_FILE: &str = "config.json";
const STORE_KEY: &str = "app";

const DEFAULT_FULL: &str = "CmdOrCtrl+Alt+Shift+3";
const DEFAULT_AREA: &str = "CmdOrCtrl+Alt+Shift+4";

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureKind {
    Full,
    Area,
}

#[derive(Clone, Serialize)]
struct ShortcutPayload {
    kind: CaptureKind,
}

fn read_hotkeys<R: Runtime>(app: &AppHandle<R>) -> (String, String) {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(_) => return (DEFAULT_FULL.into(), DEFAULT_AREA.into()),
    };
    let value = store.get(STORE_KEY);
    let mut full = DEFAULT_FULL.to_string();
    let mut area = DEFAULT_AREA.to_string();
    if let Some(v) = value {
        if let Some(hk) = v.get("hotkeys") {
            if let Some(s) = hk.get("captureFull").and_then(|x| x.as_str()) {
                full = s.to_string();
            }
            if let Some(s) = hk.get("captureArea").and_then(|x| x.as_str()) {
                area = s.to_string();
            }
        }
    }
    (full, area)
}

pub fn register_shortcuts<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let (full, area) = read_hotkeys(app);
    let gs = app.global_shortcut();

    gs.unregister_all().map_err(|e| e.to_string())?;

    let full_shortcut: Shortcut = full.parse().map_err(|e| format!("{e:?}"))?;
    let area_shortcut: Shortcut = area.parse().map_err(|e| format!("{e:?}"))?;

    let app_for_full = app.clone();
    gs.on_shortcut(full_shortcut, move |_app, _sc, event| {
        if event.state == ShortcutState::Pressed {
            emit_trigger(&app_for_full, CaptureKind::Full);
        }
    })
    .map_err(|e| {
        log::error!("failed to register full-screen shortcut '{full}': {e}");
        e.to_string()
    })?;

    let app_for_area = app.clone();
    gs.on_shortcut(area_shortcut, move |_app, _sc, event| {
        if event.state == ShortcutState::Pressed {
            emit_trigger(&app_for_area, CaptureKind::Area);
        }
    })
    .map_err(|e| {
        log::error!("failed to register area shortcut '{area}': {e}");
        e.to_string()
    })?;

    Ok(())
}

#[tauri::command]
pub fn reregister_shortcuts<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    register_shortcuts(&app)
}

#[allow(dead_code)]
pub fn unregister_all<R: Runtime>(app: &AppHandle<R>) {
    if let Err(e) = app.global_shortcut().unregister_all() {
        log::warn!("unregister_all failed: {e}");
    }
}

fn emit_trigger<R: Runtime>(app: &AppHandle<R>, kind: CaptureKind) {
    let kind_str = match kind {
        CaptureKind::Full => "full",
        CaptureKind::Area => "area",
    };
    log::info!("shortcut triggered: {kind_str}");
    if let Err(e) = app.emit("shortcut://triggered", ShortcutPayload { kind }) {
        log::warn!("emit shortcut://triggered failed: {e}");
    }
    match kind {
        CaptureKind::Full => {
            let app2 = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                match capture_service::capture_primary()
                    .and_then(|img| image_service::write_temp_png(&img))
                {
                    Ok(path) => {
                        log::info!("hotkey capture_full → {}", path.display());
                        let path_str = path.to_string_lossy().into_owned();
                        let app3 = app2.clone();
                        let _ = app2.run_on_main_thread(move || {
                            if let Err(e) = windows::show_editor(&app3, &path_str) {
                                log::error!("show_editor: {e}");
                            }
                        });
                    }
                    Err(e) => log::error!("hotkey capture_full failed: {e}"),
                }
            });
        }
        CaptureKind::Area => {
            if let Err(e) = windows::show_overlay(app) {
                log::error!("show_overlay failed: {e}");
            }
        }
    }
}
