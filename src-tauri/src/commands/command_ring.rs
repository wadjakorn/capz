use tauri::{AppHandle, Runtime};

use crate::shortcuts::CaptureKind;
use crate::windows;

/// A wedge was clicked: close the ring first (so it is never baked into a
/// full-screen/area shot), then dispatch the chosen capture exactly like the
/// tray / hotkey paths. `kind` is one of `full | area | window | scroll`.
#[tauri::command]
pub async fn command_ring_select<R: Runtime>(
    app: AppHandle<R>,
    kind: String,
) -> Result<(), String> {
    windows::close_command_ring(&app);
    let parsed = match kind.as_str() {
        "full" => CaptureKind::Full,
        "area" => CaptureKind::Area,
        "window" => CaptureKind::Window,
        "scroll" => CaptureKind::Scroll,
        other => return Err(format!("unknown capture kind: {other}")),
    };
    crate::capture_dispatch::trigger_capture(app, parsed).await
}

/// Dismiss the ring without capturing (Esc / blur / click outside the ring).
#[tauri::command]
pub fn close_command_ring<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    windows::close_command_ring(&app);
    Ok(())
}
