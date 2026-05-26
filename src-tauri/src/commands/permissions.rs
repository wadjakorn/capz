use tauri::AppHandle;

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

pub fn has_screen_recording() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        CGPreflightScreenCaptureAccess()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub fn has_screen_recording_permission() -> bool {
    has_screen_recording()
}

/// Triggers macOS to prompt user (only the first time per TCC lifecycle).
/// Returns true if already granted; false otherwise. Subsequent denials require
/// the user to grant via System Settings — call `open_system_settings_screen_recording`.
#[tauri::command]
pub fn request_screen_recording_permission() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        CGRequestScreenCaptureAccess()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub fn open_system_settings_screen_recording() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("only macOS".into())
    }
}

/// Performs a real screen capture and reports whether the buffer contains any
/// non-zero pixels. On macOS, xcap returns a zero-filled buffer (not an error)
/// when the TCC Screen Recording grant is keyed to a stale code identity —
/// e.g. after an ad-hoc-signed update changes the cdhash but System Settings
/// still shows the row as checked. Preflight returns `true` in that state, so
/// only a real capture can disambiguate "granted" from "inert".
#[tauri::command]
pub async fn probe_capture_command() -> bool {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let Ok(m) = crate::services::monitor_service::primary_monitor() else {
                return false;
            };
            let Ok(img) = m.capture_image() else {
                return false;
            };
            let raw = img.as_raw();
            if raw.is_empty() {
                return false;
            }
            // Sample up to ~64 evenly-spaced positions; bail early on first
            // non-zero RGB byte. Skip alpha (every 4th byte).
            let samples = 64usize.min(raw.len() / 4);
            if samples == 0 {
                return false;
            }
            let stride = (raw.len() / 4 / samples).max(1);
            for i in 0..samples {
                let off = i * stride * 4;
                if off + 2 >= raw.len() {
                    break;
                }
                if raw[off] != 0 || raw[off + 1] != 0 || raw[off + 2] != 0 {
                    return true;
                }
            }
            false
        })
        .await
        .unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub fn relaunch_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn show_onboarding_window(app: AppHandle) -> Result<(), String> {
    crate::windows::show_onboarding(&app).map_err(|e| e.to_string())
}
