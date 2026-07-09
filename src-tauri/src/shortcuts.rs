use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

use crate::accel::{classify, AccelClass};
use crate::services::config_store::{config_store_path, CONFIG_STORE_KEY};
use crate::windows;

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
    Scroll,
}

#[derive(Clone, Serialize)]
struct ShortcutPayload {
    kind: CaptureKind,
}

#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum RegoStatus {
    Ok,
    Invalid,
    Taken,
    Reserved,
}

#[derive(Clone, Copy, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum HotkeyAction {
    CaptureFull,
    CaptureArea,
    CaptureWindow,
    ShowEditor,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RegoResult {
    pub action: HotkeyAction,
    pub requested: String,
    pub effective: String,
    pub status: RegoStatus,
}

fn default_accel(action: HotkeyAction) -> &'static str {
    match action {
        HotkeyAction::CaptureFull => DEFAULT_FULL,
        HotkeyAction::CaptureArea => DEFAULT_AREA,
        HotkeyAction::CaptureWindow => DEFAULT_WINDOW,
        HotkeyAction::ShowEditor => DEFAULT_SHOW_EDITOR,
    }
}

/// Decide what to attempt registering for one action before any live call.
/// Invalid/Reserved requests fall back to the action's default so the app
/// stays usable; the returned status describes the REQUESTED value.
pub fn plan_one(action: HotkeyAction, requested: &str, is_windows: bool) -> (String, RegoStatus) {
    match classify(requested, is_windows) {
        AccelClass::Valid => (requested.to_string(), RegoStatus::Ok),
        AccelClass::Invalid => (default_accel(action).to_string(), RegoStatus::Invalid),
        AccelClass::Reserved => (default_accel(action).to_string(), RegoStatus::Reserved),
    }
}

fn read_hotkeys<R: Runtime>(app: &AppHandle<R>) -> (String, String, String, String) {
    let defaults = || {
        (
            DEFAULT_FULL.into(),
            DEFAULT_AREA.into(),
            DEFAULT_WINDOW.into(),
            DEFAULT_SHOW_EDITOR.into(),
        )
    };
    let Ok(path) = config_store_path(app) else {
        return defaults();
    };
    let store = match app.store(path) {
        Ok(s) => s,
        Err(_) => return defaults(),
    };
    let value = store.get(CONFIG_STORE_KEY);
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

fn dispatch_action<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction) {
    match action {
        HotkeyAction::CaptureFull => emit_trigger(app, CaptureKind::Full),
        HotkeyAction::CaptureArea => emit_trigger(app, CaptureKind::Area),
        HotkeyAction::CaptureWindow => emit_trigger(app, CaptureKind::Window),
        HotkeyAction::ShowEditor => {
            log::info!("shortcut triggered: show_editor");
            if let Err(e) = windows::show_editor(app) {
                log::error!("show_editor failed: {e}");
            }
        }
    }
}

fn register_one<R: Runtime>(
    app: &AppHandle<R>,
    action: HotkeyAction,
    accel: &str,
) -> Result<(), String> {
    let sc: Shortcut = accel.parse().map_err(|e| format!("{e:?}"))?;
    let app2 = app.clone();
    app.global_shortcut()
        .on_shortcut(sc, move |_app, _sc, event| {
            if event.state == ShortcutState::Pressed {
                dispatch_action(&app2, action);
            }
        })
        .map_err(|e| e.to_string())
}

/// Register all four hotkeys independently. One failure never aborts the rest.
/// Returns a per-action report; each status describes the requested value.
pub fn register_shortcuts<R: Runtime>(app: &AppHandle<R>) -> Vec<RegoResult> {
    let (full, area, window, show_editor) = read_hotkeys(app);
    let _ = app.global_shortcut().unregister_all();
    let win = cfg!(target_os = "windows");

    let items = [
        (HotkeyAction::CaptureFull, full),
        (HotkeyAction::CaptureArea, area),
        (HotkeyAction::CaptureWindow, window),
        (HotkeyAction::ShowEditor, show_editor),
    ];

    let mut report = Vec::with_capacity(items.len());
    for (action, requested) in items {
        let (effective, pre) = plan_one(action, &requested, win);
        let status = match register_one(app, action, &effective) {
            Ok(()) => pre,
            Err(e) => {
                log::error!("register {action:?} '{effective}' failed: {e}");
                // A live failure on a Valid request means the OS rejected it.
                if pre == RegoStatus::Ok {
                    RegoStatus::Taken
                } else {
                    pre
                }
            }
        };
        report.push(RegoResult {
            action,
            requested,
            effective,
            status,
        });
    }
    report
}

#[tauri::command]
pub fn reregister_shortcuts<R: Runtime>(app: AppHandle<R>) -> Vec<RegoResult> {
    register_shortcuts(&app)
}

#[derive(Clone, Copy, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyProbe {
    pub status: RegoStatus,
}

/// Record-time probe: classify, then (if valid) attempt a throwaway register to
/// detect a live conflict. Must be called while shortcuts are suspended (the
/// recorder suspends on focus) so our own bindings don't read as taken.
#[tauri::command]
pub fn probe_hotkey<R: Runtime>(app: AppHandle<R>, accel: String) -> HotkeyProbe {
    let win = cfg!(target_os = "windows");
    let status = match classify(&accel, win) {
        AccelClass::Invalid => RegoStatus::Invalid,
        AccelClass::Reserved => RegoStatus::Reserved,
        AccelClass::Valid => match accel.parse::<Shortcut>() {
            Ok(sc) => {
                let gs = app.global_shortcut();
                match gs.register(sc) {
                    Ok(()) => {
                        let _ = gs.unregister(sc);
                        RegoStatus::Ok
                    }
                    Err(_) => RegoStatus::Taken,
                }
            }
            Err(_) => RegoStatus::Invalid,
        },
    };
    HotkeyProbe { status }
}

/// Temporarily release all global shortcuts (e.g. while user is recording a new
/// hotkey in Settings so the existing binding doesn't swallow the keystroke).
/// Pair with `reregister_shortcuts` on field blur / save.
#[tauri::command]
pub fn suspend_shortcuts<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())
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
        CaptureKind::Scroll => "scroll",
    };
    log::info!("shortcut triggered: {kind_str}");
    if let Err(e) = app.emit("shortcut://triggered", ShortcutPayload { kind }) {
        log::warn!("emit shortcut://triggered failed: {e}");
    }
    let app_dispatch = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::capture_dispatch::trigger_capture(app_dispatch, kind).await {
            log::error!("trigger_capture failed: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_request_keeps_itself_and_ok() {
        let (eff, st) = plan_one(HotkeyAction::CaptureFull, "CmdOrCtrl+Alt+Shift+A", true);
        assert_eq!(eff, "CmdOrCtrl+Alt+Shift+A");
        assert_eq!(st, RegoStatus::Ok);
    }

    #[test]
    fn invalid_request_falls_back_to_default() {
        let (eff, st) = plan_one(HotkeyAction::CaptureArea, "3", true); // no modifier
        assert_eq!(eff, DEFAULT_AREA);
        assert_eq!(st, RegoStatus::Invalid);
    }

    #[test]
    fn reserved_request_falls_back_to_default() {
        let (eff, st) = plan_one(HotkeyAction::CaptureWindow, "Alt+Tab", true);
        assert_eq!(eff, DEFAULT_WINDOW);
        assert_eq!(st, RegoStatus::Reserved);
    }
}
