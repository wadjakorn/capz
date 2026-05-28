//! Plays a short capture-confirmation sound via the OS.
//!
//! Frontend Web Audio approach is unreliable here because the editor webview
//! may be hidden/unfocused when a capture lands, and autoplay policies hold
//! the AudioContext in a suspended state until user gesture. Shelling out to
//! the OS sidesteps both issues and adds no runtime dependency.

use std::process::Command;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::services::config_store::{config_store_path, CONFIG_STORE_KEY};

fn enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Ok(path) = config_store_path(app) else {
        return false;
    };
    let Ok(store) = app.store(path) else {
        return false;
    };
    let Some(v) = store.get(CONFIG_STORE_KEY) else {
        return false;
    };
    v.get("general")
        .and_then(|g| g.get("playSoundOnCapture"))
        .and_then(|x| x.as_bool())
        .unwrap_or(false)
}

/// Fire-and-forget. Silently no-ops on unsupported platforms or spawn errors.
pub fn play_capture_sound<R: Runtime>(app: &AppHandle<R>) {
    if !enabled(app) {
        return;
    }
    let res = spawn_player();
    if let Err(e) = res {
        log::warn!("capture sound spawn failed: {e}");
    }
}

#[cfg(target_os = "macos")]
fn spawn_player() -> std::io::Result<()> {
    Command::new("afplay")
        .arg("/System/Library/Sounds/Tink.aiff")
        .spawn()
        .map(|_| ())
}

#[cfg(target_os = "windows")]
fn spawn_player() -> std::io::Result<()> {
    Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "[System.Media.SystemSounds]::Asterisk.Play()",
        ])
        .spawn()
        .map(|_| ())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn spawn_player() -> std::io::Result<()> {
    Ok(())
}
