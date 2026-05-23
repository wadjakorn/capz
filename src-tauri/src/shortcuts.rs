use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

use crate::windows;

const STORE_FILE: &str = "config.json";
const STORE_KEY: &str = "app";

const DEFAULT_FULL: &str = "CmdOrCtrl+Alt+Shift+3";
const DEFAULT_AREA: &str = "CmdOrCtrl+Alt+Shift+4";
const DEFAULT_WINDOW: &str = "CmdOrCtrl+Alt+Shift+5";
const DEFAULT_SHOW_EDITOR: &str = "CmdOrCtrl+Alt+Shift+0";

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureKind {
    Full,
    Area,
    Window,
}

#[derive(Clone, Serialize)]
struct ShortcutPayload {
    kind: CaptureKind,
}

fn read_hotkeys<R: Runtime>(app: &AppHandle<R>) -> (String, String, String, String) {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(_) => {
            return (
                DEFAULT_FULL.into(),
                DEFAULT_AREA.into(),
                DEFAULT_WINDOW.into(),
                DEFAULT_SHOW_EDITOR.into(),
            )
        }
    };
    let value = store.get(STORE_KEY);
    let mut full = DEFAULT_FULL.to_string();
    let mut area = DEFAULT_AREA.to_string();
    let mut window = DEFAULT_WINDOW.to_string();
    let mut show_editor = DEFAULT_SHOW_EDITOR.to_string();
    if let Some(v) = value {
        if let Some(hk) = v.get("hotkeys") {
            if let Some(s) = hk.get("captureFull").and_then(|x| x.as_str()) {
                full = s.to_string();
            }
            if let Some(s) = hk.get("captureArea").and_then(|x| x.as_str()) {
                area = s.to_string();
            }
            if let Some(s) = hk.get("captureWindow").and_then(|x| x.as_str()) {
                window = s.to_string();
            }
            if let Some(s) = hk.get("showEditor").and_then(|x| x.as_str()) {
                show_editor = s.to_string();
            }
        }
    }
    (full, area, window, show_editor)
}

pub fn register_shortcuts<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let (full, area, window, show_editor) = read_hotkeys(app);
    let gs = app.global_shortcut();

    gs.unregister_all().map_err(|e| e.to_string())?;

    let full_shortcut: Shortcut = full.parse().map_err(|e| format!("{e:?}"))?;
    let area_shortcut: Shortcut = area.parse().map_err(|e| format!("{e:?}"))?;
    let window_shortcut: Shortcut = window.parse().map_err(|e| format!("{e:?}"))?;
    let show_editor_shortcut: Shortcut = show_editor.parse().map_err(|e| format!("{e:?}"))?;

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

    let app_for_window = app.clone();
    gs.on_shortcut(window_shortcut, move |_app, _sc, event| {
        if event.state == ShortcutState::Pressed {
            emit_trigger(&app_for_window, CaptureKind::Window);
        }
    })
    .map_err(|e| {
        log::error!("failed to register window shortcut '{window}': {e}");
        e.to_string()
    })?;

    let app_for_show = app.clone();
    gs.on_shortcut(show_editor_shortcut, move |_app, _sc, event| {
        if event.state == ShortcutState::Pressed {
            log::info!("shortcut triggered: show_editor");
            if let Err(e) = windows::show_editor(&app_for_show) {
                log::error!("show_editor failed: {e}");
            }
        }
    })
    .map_err(|e| {
        log::error!("failed to register show_editor shortcut '{show_editor}': {e}");
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
        CaptureKind::Window => "window",
    };
    log::info!("shortcut triggered: {kind_str}");
    if let Err(e) = app.emit("shortcut://triggered", ShortcutPayload { kind }) {
        log::warn!("emit shortcut://triggered failed: {e}");
    }
    match kind {
        CaptureKind::Full => crate::capture_dispatch::dispatch_full(app),
        CaptureKind::Area => {
            if let Err(e) = windows::show_overlay(app) {
                log::error!("show_overlay failed: {e}");
            }
        }
        CaptureKind::Window => crate::capture_dispatch::dispatch_window(app),
    }
}
